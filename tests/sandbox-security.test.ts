import assert from "node:assert/strict";
import { test } from "node:test";
import {
  githubRequestCanUseRepoCredential,
  githubRequestMatchesRepo,
  hostMatches,
  matchesAnyHost,
} from "../src/sandbox-security.ts";

test("host matching supports exact and wildcard hosts without parent-domain leakage", () => {
  assert.equal(hostMatches("api.github.com", "api.github.com"), true);
  assert.equal(hostMatches("docs.example.com", "*.example.com"), true);
  assert.equal(hostMatches("example.com", "*.example.com"), false);
  assert.equal(hostMatches("badexample.com", "*.example.com"), false);
  assert.equal(matchesAnyHost("RAW.GITHUBUSERCONTENT.COM", ["raw.githubusercontent.com"]), true);
});

test("GitHub credential injection stays scoped to the configured repository", () => {
  const repo = "openclaw/crabfleet";

  assert.equal(
    githubRequestMatchesRepo(new URL("https://github.com/openclaw/crabfleet.git"), repo),
    true,
  );
  assert.equal(
    githubRequestMatchesRepo(
      new URL("https://api.github.com/repos/openclaw/crabfleet/pulls"),
      repo,
    ),
    true,
  );
  assert.equal(
    githubRequestMatchesRepo(
      new URL("https://raw.githubusercontent.com/openclaw/crabfleet/main/README.md"),
      repo,
    ),
    true,
  );
  assert.equal(
    githubRequestMatchesRepo(
      new URL(
        "https://uploads.github.com/repos/openclaw/crabfleet/releases/42/assets?name=app.zip",
      ),
      repo,
    ),
    true,
  );
  assert.equal(
    githubRequestMatchesRepo(new URL("https://github.com/openclaw/agent-skills.git"), repo),
    false,
  );
  assert.equal(githubRequestMatchesRepo(new URL("https://api.github.com/user"), repo), false);
});

test("GitHub REST credential injection uses method and endpoint allowlists", async () => {
  const repo = "openclaw/crabfleet";
  assert.equal(
    await githubRequestCanUseRepoCredential(
      new Request("https://api.github.com/repos/openclaw/crabfleet/pulls"),
      new URL("https://api.github.com/repos/openclaw/crabfleet/pulls"),
      repo,
    ),
    true,
  );
  assert.equal(
    await githubRequestCanUseRepoCredential(
      new Request("https://api.github.com/repos/openclaw/crabfleet/hooks", { method: "POST" }),
      new URL("https://api.github.com/repos/openclaw/crabfleet/hooks"),
      repo,
    ),
    false,
  );
  assert.equal(
    await githubRequestCanUseRepoCredential(
      new Request("https://raw.githubusercontent.com/openclaw/crabfleet/main/README.md", {
        method: "POST",
      }),
      new URL("https://raw.githubusercontent.com/openclaw/crabfleet/main/README.md"),
      repo,
    ),
    false,
  );
  assert.equal(
    await githubRequestCanUseRepoCredential(
      new Request("https://uploads.github.com/repos/openclaw/crabfleet/releases/42/assets", {
        method: "POST",
      }),
      new URL("https://uploads.github.com/repos/openclaw/crabfleet/releases/42/assets"),
      repo,
    ),
    true,
  );
  assert.equal(
    await githubRequestCanUseRepoCredential(
      new Request("https://uploads.github.com/repos/openclaw/agent-skills/releases/42/assets", {
        method: "POST",
      }),
      new URL("https://uploads.github.com/repos/openclaw/agent-skills/releases/42/assets"),
      repo,
    ),
    false,
  );
});

test("GitHub GraphQL credential injection permits scoped repository queries", async () => {
  const url = new URL("https://api.github.com/graphql");
  const repositoryQuery = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        "query($owner:String!, $name:String!) { repository(owner:$owner, name:$name) { id nameWithOwner defaultBranchRef { name target { oid } } } rateLimit { remaining } }",
      variables: { owner: "openclaw", name: "crabfleet" },
    }),
  });
  const literalRepositoryQuery = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        'query { repository(owner:"openclaw", name:"crabfleet") { pullRequest(number:1) { id number } } }',
    }),
  });
  const traversalQuery = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        'query { repository(owner:"openclaw", name:"crabfleet") { owner { repositories(first:100) { nodes { nameWithOwner isPrivate } } } } }',
    }),
  });

  assert.equal(
    await githubRequestCanUseRepoCredential(repositoryQuery, url, "openclaw/crabfleet"),
    true,
  );
  assert.equal(
    await githubRequestCanUseRepoCredential(literalRepositoryQuery, url, "openclaw/crabfleet"),
    true,
  );
  assert.equal(
    await githubRequestCanUseRepoCredential(traversalQuery, url, "openclaw/crabfleet"),
    false,
  );
});

test("GitHub GraphQL credential injection ignores unused matching variables", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query: "query($login:String!) { user(login:$login) { id } }",
      variables: { login: "somebody", owner: "openclaw", name: "crabfleet" },
    }),
  });

  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection rejects mixed root selections", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        "query($owner:String!, $name:String!) { viewer { login } repository(owner:$owner, name:$name) { id } }",
      variables: { owner: "openclaw", name: "crabfleet" },
    }),
  });

  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection rejects mixed repositories", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        'query { a: repository(owner:"openclaw", name:"crabfleet") { id } b: repository(owner:"openclaw", name:"agent-skills") { id } }',
    }),
  });

  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection rejects fragments", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        'query { repository(owner:"openclaw", name:"crabfleet") { ...Leak } } fragment Leak on Repository { owner { repositories(first:100) { nodes { nameWithOwner isPrivate } } } }',
    }),
  });

  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection rejects multi-operation documents", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      operationName: "Bad",
      query:
        'query Good { repository(owner:"openclaw", name:"crabfleet") { id } } query Bad { viewer { login } }',
    }),
  });

  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection honors single operation names", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      operationName: "CreatePR",
      query:
        "mutation CreatePR($input:CreatePullRequestInput!) { createPullRequest(input:$input) { pullRequest { id } } }",
      variables: { input: { repositoryId: "R_repo", title: "test", headRefName: "x" } },
    }),
  });
  const mismatch = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      operationName: "Other",
      query:
        "mutation CreatePR($input:CreatePullRequestInput!) { createPullRequest(input:$input) { pullRequest { id } } }",
      variables: { input: { repositoryId: "R_repo", title: "test", headRefName: "x" } },
    }),
  });

  assert.equal(
    await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet", {
      repoNodeId: "R_repo",
    }),
    true,
  );
  assert.equal(await githubRequestCanUseRepoCredential(mismatch, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection permits repo-id-scoped mutations", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        "mutation($input:CreatePullRequestInput!) { createPullRequest(input:$input) { pullRequest { id } } }",
      variables: { input: { repositoryId: "R_repo", title: "test", headRefName: "x" } },
    }),
  });
  const wrongRepo = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        "mutation($input:CreatePullRequestInput!) { createPullRequest(input:$input) { pullRequest { id } } }",
      variables: { input: { repositoryId: "R_other", title: "test", headRefName: "x" } },
    }),
  });

  assert.equal(
    await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet", {
      repoNodeId: "R_repo",
    }),
    true,
  );
  assert.equal(
    await githubRequestCanUseRepoCredential(wrongRepo, url, "openclaw/crabfleet", {
      repoNodeId: "R_repo",
    }),
    false,
  );
});

test("GitHub GraphQL credential injection rejects unscoped create pull request mutations", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        'mutation { createPullRequest(input:{repositoryId:"R_repo", title:"test", headRefName:"x", baseRefName:"main"}) { pullRequest { id } } }',
    }),
  });

  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection rejects mutation response traversal", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        "mutation($input:CreatePullRequestInput!) { createPullRequest(input:$input) { pullRequest { repository { owner { repositories(first:100) { nodes { nameWithOwner } } } } } } }",
      variables: { input: { repositoryId: "R_repo", title: "test", headRefName: "x" } },
    }),
  });

  assert.equal(
    await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet", {
      repoNodeId: "R_repo",
    }),
    false,
  );
});

test("GitHub GraphQL credential injection permits whitelisted node-id mutations", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        "mutation($id:ID!, $body:String!) { addComment(input:{subjectId:$id, body:$body}) { clientMutationId } }",
      variables: { id: "PR_kwDO", body: "ack" },
    }),
  });

  assert.equal(
    await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet", {
      nodeBelongsToRepo: async (nodeId) => nodeId === "PR_kwDO",
    }),
    true,
  );
  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection rejects non-whitelisted mutations", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query: "mutation($id:ID!) { deleteRef(input:{refId:$id}) { clientMutationId } }",
      variables: { id: "REF" },
    }),
  });

  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection verifies lower-case mutation ids", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        "mutation($id:ID!, $body:String!) { updateIssueComment(input:{id:$id, body:$body}) { issueComment { id } } }",
      variables: { id: "IC_kwDO", body: "ack" },
    }),
  });

  assert.equal(
    await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet", {
      nodeBelongsToRepo: async (nodeId) => nodeId === "IC_kwDO",
    }),
    true,
  );
  assert.equal(await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet"), false);
});

test("GitHub GraphQL credential injection ignores unused mutation repository variables", async () => {
  const url = new URL("https://api.github.com/graphql");
  const request = new Request(url, {
    method: "POST",
    body: JSON.stringify({
      query:
        'mutation($id:ID!) { updateIssueComment(input:{id:$id, body:"ack"}) { issueComment { id } } }',
      variables: { id: "IC_kwDO", input: { repositoryId: "R_repo" } },
    }),
  });

  assert.equal(
    await githubRequestCanUseRepoCredential(request, url, "openclaw/crabfleet", {
      repoNodeId: "R_repo",
    }),
    false,
  );
});
