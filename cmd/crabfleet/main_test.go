package main

import "testing"

func TestVersionIsSet(t *testing.T) {
	if version == "" {
		t.Fatal("version is empty")
	}
}

func TestJSONModeDoesNotDelegateToSSH(t *testing.T) {
	app := &cli{JSON: true, API: defaultAPIURL, SSHHost: defaultSSHHost}
	err := listCmd{}.Run(app, app.apiClient())
	if err == nil {
		t.Fatal("expected API credential error")
	}
}

func TestShellQuoteMatchesGatewaySplitter(t *testing.T) {
	remote := "new --command " + shellQuote("codex --yolo") + " " + shellQuote("fix John's bug")
	args, err := splitForTest(remote)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := args[2], "codex --yolo"; got != want {
		t.Fatalf("command = %q, want %q", got, want)
	}
	if got, want := args[3], "fix John's bug"; got != want {
		t.Fatalf("prompt = %q, want %q", got, want)
	}
}

func TestFirstLineSkipsBlankLines(t *testing.T) {
	if got, want := firstLine("\n\n https://example.com/vnc\nignored\n"), "https://example.com/vnc"; got != want {
		t.Fatalf("firstLine = %q, want %q", got, want)
	}
}

func TestAttachableRequiresReadySessionWithAttachURL(t *testing.T) {
	if !attachable(interactiveSession{Status: "ready", AttachURL: "/api/interactive-sessions/IS-1/pty"}) {
		t.Fatal("ready session with sandbox attach URL should be attachable")
	}
	if attachable(interactiveSession{Status: "pending_adapter", LeaseID: "sandbox:test"}) {
		t.Fatal("pending session should not be attachable")
	}
	if attachable(interactiveSession{Status: "ready", AttachURL: "https://example.com/console"}) {
		t.Fatal("http console URL should not be SSH attachable")
	}
	if !attachable(interactiveSession{Status: "ready", LeaseID: "sandbox:test"}) {
		t.Fatal("sandbox lease should be attachable")
	}
}

func splitForTest(command string) ([]string, error) {
	var args []string
	var current []rune
	var quote rune
	escaped := false
	hasValue := false
	for _, r := range command {
		if escaped {
			current = append(current, r)
			hasValue = true
			escaped = false
			continue
		}
		if r == '\\' {
			escaped = true
			continue
		}
		if quote != 0 {
			if r == quote {
				quote = 0
				hasValue = true
				continue
			}
			current = append(current, r)
			hasValue = true
			continue
		}
		if r == '\'' || r == '"' {
			quote = r
			hasValue = true
			continue
		}
		if r == ' ' {
			if hasValue {
				args = append(args, string(current))
				current = nil
				hasValue = false
			}
			continue
		}
		current = append(current, r)
		hasValue = true
	}
	if hasValue {
		args = append(args, string(current))
	}
	return args, nil
}
