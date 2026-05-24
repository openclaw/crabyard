package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"sort"
	"strings"
	"time"

	"github.com/alecthomas/kong"
)

const defaultAPIURL = "https://crabfleet.ai"
const defaultSSHHost = "ssh.crabfleet.ai"

var version = "dev"

type cli struct {
	API         string `help:"Crabfleet API URL." default:"https://crabfleet.ai" env:"CRABFLEET_API_URL"`
	SSHHost     string `help:"Crabfleet SSH host." default:"ssh.crabfleet.ai" env:"CRABFLEET_SSH_HOST"`
	Token       string `help:"Internal API token." env:"CRABFLEET_SSH_GATEWAY_TOKEN"`
	Fingerprint string `help:"Linked SSH key fingerprint." env:"CRABFLEET_SSH_FINGERPRINT"`
	JSON        bool   `help:"Print JSON output."`
	Plain       bool   `help:"Print plain output without adornment."`
	NoInput     bool   `help:"Fail instead of prompting or delegating to SSH."`
	Version     kong.VersionFlag

	Login  loginCmd  `cmd:"" help:"Link this machine through SSH onboarding."`
	Whoami whoamiCmd `cmd:"" help:"Show the linked Crabfleet user."`
	List   listCmd   `cmd:"" aliases:"ls" help:"List crabboxes grouped by person."`
	New    newCmd    `cmd:"" help:"Create a repo-ready crabbox and attach."`
	Attach attachCmd `cmd:"" help:"Attach to a crabbox terminal."`
	VNC    vncCmd    `cmd:"" help:"Print or open a crabbox WebVNC URL."`
	Open   openCmd   `cmd:"" help:"Open the Crabfleet dashboard."`
}

type loginCmd struct{}
type whoamiCmd struct{}
type listCmd struct{}

type newCmd struct {
	Repo    string   `help:"Repository to prepare, owner/repo."`
	Branch  string   `help:"Git branch to checkout." default:"main"`
	Runtime string   `help:"Runtime backend." enum:"crabbox,container" default:"crabbox"`
	Command string   `help:"Command to run after checkout." default:"codex --yolo"`
	Detach  bool     `help:"Create the crabbox without attaching to it."`
	Prompt  []string `arg:"" optional:"" help:"Initial prompt for Codex."`
}

type attachCmd struct {
	ID string `arg:"" help:"Crabbox session id."`
}

type vncCmd struct {
	ID   string `arg:"" help:"Crabbox session id."`
	Open bool   `help:"Open the VNC URL in a browser."`
}

type openCmd struct{}

type apiClient struct {
	baseURL     string
	token       string
	fingerprint string
	http        *http.Client
}

type stateResponse struct {
	User                user                 `json:"user"`
	Repos               []string             `json:"repos"`
	InteractiveSessions []interactiveSession `json:"interactiveSessions"`
}

type user struct {
	Login   string `json:"login"`
	Email   string `json:"email"`
	Subject string `json:"subject"`
	Role    string `json:"role"`
}

type interactiveSession struct {
	ID        string `json:"id"`
	Repo      string `json:"repo"`
	Branch    string `json:"branch"`
	Runtime   string `json:"runtime"`
	Status    string `json:"status"`
	Owner     string `json:"owner"`
	LeaseID   string `json:"leaseId"`
	AttachURL string `json:"attachUrl"`
	VNCURL    string `json:"vncUrl"`
	LastEvent string `json:"lastEvent"`
}

type createSessionRequest struct {
	Repo    string `json:"repo,omitempty"`
	Branch  string `json:"branch,omitempty"`
	Runtime string `json:"runtime,omitempty"`
	Command string `json:"command,omitempty"`
	Prompt  string `json:"prompt,omitempty"`
}

type createSessionResponse struct {
	Session interactiveSession `json:"session"`
}

func main() {
	var app cli
	ctx := kong.Parse(
		&app,
		kong.Name("crabfleet"),
		kong.Description("Crabfleet crabbox CLI."),
		kong.Vars{"version": version},
	)
	api := app.apiClient()
	err := ctx.Run(&app, api)
	ctx.FatalIfErrorf(err)
}

func (c *cli) apiClient() *apiClient {
	return &apiClient{
		baseURL:     strings.TrimRight(c.API, "/"),
		token:       c.Token,
		fingerprint: c.Fingerprint,
		http:        &http.Client{Timeout: 2 * time.Minute},
	}
}

func (loginCmd) Run(app *cli, _ *apiClient) error {
	if app.JSON {
		return json.NewEncoder(os.Stdout).Encode(map[string]string{
			"ssh": fmt.Sprintf("ssh link@%s", app.SSHHost),
			"app": app.API + "/app/",
		})
	}
	fmt.Fprintf(os.Stdout, "ssh: ssh link@%s\napp: %s/app/\n", app.SSHHost, app.API)
	return nil
}

func (whoamiCmd) Run(app *cli, api *apiClient) error {
	state, err := api.state(context.Background())
	if err != nil {
		if app.NoInput || app.JSON {
			return err
		}
		return runSSH(app, "whoami")
	}
	if app.JSON {
		return json.NewEncoder(os.Stdout).Encode(state.User)
	}
	fmt.Fprintf(os.Stdout, "login: %s\nrole: %s\n", displayUser(state.User), state.User.Role)
	return nil
}

func (listCmd) Run(app *cli, api *apiClient) error {
	state, err := api.state(context.Background())
	if err != nil {
		if app.NoInput || app.JSON {
			return err
		}
		return runSSH(app, "list")
	}
	if app.JSON {
		return json.NewEncoder(os.Stdout).Encode(state)
	}
	printFleet(os.Stdout, state.InteractiveSessions)
	return nil
}

func (cmd newCmd) Run(app *cli, api *apiClient) error {
	prompt := strings.Join(cmd.Prompt, " ")
	req := createSessionRequest{
		Repo:    cmd.Repo,
		Branch:  cmd.Branch,
		Runtime: cmd.Runtime,
		Command: cmd.Command,
		Prompt:  prompt,
	}
	session, err := api.createSession(context.Background(), req)
	if err != nil {
		if app.NoInput || app.JSON {
			return err
		}
		args := []string{"new", "--branch", cmd.Branch, "--runtime", cmd.Runtime}
		if cmd.Repo != "" {
			args = append(args, "--repo", cmd.Repo)
		}
		if cmd.Command != "codex --yolo" {
			args = append(args, "--command", cmd.Command)
		}
		if cmd.Detach {
			args = append(args, "--detach")
		}
		if prompt != "" {
			args = append(args, prompt)
		}
		return runSSHCommand(app, args...)
	}
	if app.JSON {
		return json.NewEncoder(os.Stdout).Encode(session)
	}
	fmt.Fprintf(os.Stdout, "session: %s\nrepo: %s\nstatus: %s\n", session.ID, session.Repo, session.Status)
	fmt.Fprintf(os.Stdout, "attach: crabfleet attach %s\n", session.ID)
	if session.VNCURL != "" {
		fmt.Fprintf(os.Stdout, "vnc: %s\n", session.VNCURL)
	}
	if !cmd.Detach && !app.NoInput && isTerminal(os.Stdin) && isTerminal(os.Stdout) && attachable(session) {
		return runSSH(app, "attach", session.ID)
	}
	return nil
}

func (cmd attachCmd) Run(app *cli, _ *apiClient) error {
	return runSSH(app, "attach", cmd.ID)
}

func (cmd vncCmd) Run(app *cli, api *apiClient) error {
	state, err := api.state(context.Background())
	if err != nil {
		if app.NoInput || app.JSON {
			return err
		}
		if cmd.Open {
			url, captureErr := runSSHOutput(app, "vnc", cmd.ID)
			if captureErr != nil {
				return captureErr
			}
			url = firstLine(url)
			if url == "" {
				return errors.New("ssh gateway did not return a WebVNC URL")
			}
			return openURL(url)
		}
		return runSSH(app, "vnc", cmd.ID)
	}
	for _, session := range state.InteractiveSessions {
		if session.ID != cmd.ID {
			continue
		}
		if session.VNCURL == "" {
			return fmt.Errorf("session %s has no WebVNC URL yet", cmd.ID)
		}
		if cmd.Open {
			return openURL(session.VNCURL)
		}
		fmt.Fprintln(os.Stdout, session.VNCURL)
		return nil
	}
	return fmt.Errorf("session %s not found", cmd.ID)
}

func (openCmd) Run(app *cli, _ *apiClient) error {
	return openURL(app.API + "/app/")
}

func (c *apiClient) state(ctx context.Context) (stateResponse, error) {
	var out stateResponse
	err := c.do(ctx, http.MethodGet, "/api/ssh/state", nil, &out)
	return out, err
}

func (c *apiClient) createSession(ctx context.Context, req createSessionRequest) (interactiveSession, error) {
	var out createSessionResponse
	err := c.do(ctx, http.MethodPost, "/api/ssh/interactive-sessions", req, &out)
	return out.Session, err
}

func (c *apiClient) do(ctx context.Context, method string, path string, body any, out any) error {
	if c.token == "" || c.fingerprint == "" {
		return errors.New("CRABFLEET_SSH_GATEWAY_TOKEN and CRABFLEET_SSH_FINGERPRINT are required for API mode")
	}
	var reader io.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(payload)
	}
	req, err := http.NewRequestWithContext(ctx, method, c.baseURL+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("X-Crabfleet-SSH-Fingerprint", c.fingerprint)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		text, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("api %s: %s", resp.Status, strings.TrimSpace(string(text)))
	}
	if out == nil {
		return nil
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

func printFleet(out io.Writer, sessions []interactiveSession) {
	groups := map[string][]interactiveSession{}
	for _, session := range sessions {
		owner := session.Owner
		if owner == "" {
			owner = "unassigned"
		}
		groups[owner] = append(groups[owner], session)
	}
	owners := make([]string, 0, len(groups))
	for owner := range groups {
		owners = append(owners, owner)
	}
	sort.Strings(owners)
	if len(owners) == 0 {
		fmt.Fprintln(out, "crabboxes: none")
		return
	}
	for _, owner := range owners {
		fmt.Fprintf(out, "%s:\n", owner)
		for _, session := range groups[owner] {
			fmt.Fprintf(out, "  %s  %s  %s  %s\n", session.ID, session.Status, session.Runtime, session.Repo)
		}
	}
}

func runSSH(app *cli, args ...string) error {
	sshArgs := append([]string{app.SSHHost}, args...)
	cmd := exec.Command("ssh", sshArgs...)
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	return cmd.Run()
}

func runSSHCommand(app *cli, args ...string) error {
	parts := make([]string, len(args))
	for i, arg := range args {
		parts[i] = shellQuote(arg)
	}
	return runSSH(app, strings.Join(parts, " "))
}

func runSSHOutput(app *cli, args ...string) (string, error) {
	sshArgs := append([]string{app.SSHHost}, args...)
	cmd := exec.Command("ssh", sshArgs...)
	cmd.Stderr = os.Stderr
	output, err := cmd.Output()
	return string(output), err
}

func shellQuote(value string) string {
	if value == "" {
		return "''"
	}
	if strings.IndexFunc(value, func(r rune) bool {
		return r == ' ' || r == '\t' || r == '\n' || r == '\r' || r == '\'' || r == '"' || r == '\\'
	}) == -1 {
		return value
	}
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func openURL(url string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	return cmd.Run()
}

func firstLine(value string) string {
	for _, line := range strings.Split(value, "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			return trimmed
		}
	}
	return ""
}

func attachable(session interactiveSession) bool {
	if !ptyAttachable(session) {
		return false
	}
	switch session.Status {
	case "ready", "attached", "detached":
		return true
	default:
		return false
	}
}

func ptyAttachable(session interactiveSession) bool {
	if strings.HasPrefix(session.LeaseID, "sandbox:") || strings.HasPrefix(session.LeaseID, "cloudflare:") {
		return true
	}
	return strings.HasPrefix(session.AttachURL, "/api/interactive-sessions/") ||
		strings.HasPrefix(session.AttachURL, "ws://") ||
		strings.HasPrefix(session.AttachURL, "wss://")
}

func isTerminal(file *os.File) bool {
	info, err := file.Stat()
	return err == nil && (info.Mode()&os.ModeCharDevice) != 0
}

func displayUser(u user) string {
	if u.Login != "" {
		return "@" + u.Login
	}
	if u.Email != "" {
		return u.Email
	}
	if u.Subject != "" {
		return u.Subject
	}
	return "unknown"
}
