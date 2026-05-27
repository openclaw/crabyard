export function hostMatches(host: string, pattern: string): boolean {
  const normalizedHost = host.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();
  if (normalizedPattern.startsWith("*.")) {
    const suffix = normalizedPattern.slice(1);
    return normalizedHost.endsWith(suffix) && normalizedHost !== normalizedPattern.slice(2);
  }
  return normalizedHost === normalizedPattern;
}

export function matchesAnyHost(host: string, patterns: string[]): boolean {
  return patterns.some((pattern) => hostMatches(host, pattern));
}

export function githubRequestMatchesRepo(url: URL, repo: string): boolean {
  const [owner, name] = repo.toLowerCase().split("/");
  if (!owner || !name) return false;
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replace(/\.git$/, "").toLowerCase());
  const host = url.hostname.toLowerCase();
  if (host === "api.github.com" || host === "uploads.github.com") {
    return segments[0] === "repos" && segments[1] === owner && segments[2] === name;
  }
  if (
    host === "github.com" ||
    host === "codeload.github.com" ||
    host === "raw.githubusercontent.com"
  ) {
    return segments[0] === owner && segments[1] === name;
  }
  return false;
}

export async function githubRequestCanUseRepoCredential(
  request: Request,
  url: URL,
  repo: string,
  options: {
    nodeBelongsToRepo?: (nodeId: string) => Promise<boolean>;
    repoNodeId?: string | null;
  } = {},
): Promise<boolean> {
  if (githubRequestCanUseRestCredential(request, url, repo)) return true;
  return (
    url.hostname.toLowerCase() === "api.github.com" &&
    url.pathname === "/graphql" &&
    (await githubGraphqlRequestMatchesRepo(
      request,
      repo,
      options.repoNodeId ?? null,
      options.nodeBelongsToRepo,
    ))
  );
}

function githubRequestCanUseRestCredential(request: Request, url: URL, repo: string): boolean {
  if (!githubRequestMatchesRepo(url, repo)) return false;
  const method = request.method.toUpperCase();
  const host = url.hostname.toLowerCase();
  if (host === "raw.githubusercontent.com" || host === "codeload.github.com") {
    return method === "GET" || method === "HEAD";
  }
  if (host === "github.com") {
    return ["GET", "HEAD", "POST"].includes(method);
  }
  if (host === "uploads.github.com") {
    return githubUploadRepoEndpointCanUseCredential(url, method, repo);
  }
  if (host !== "api.github.com") return false;
  return githubApiRepoEndpointCanUseCredential(url, method, repo);
}

function githubUploadRepoEndpointCanUseCredential(url: URL, method: string, repo: string): boolean {
  const [owner, name] = repo.toLowerCase().split("/");
  if (!owner || !name) return false;
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  const rest = segments.slice(3);
  if (segments[0] !== "repos" || segments[1] !== owner || segments[2] !== name) return false;
  if (method === "POST") return pathMatches(rest, ["releases", ":number", "assets"]);
  if (method === "DELETE") return pathMatches(rest, ["releases", "assets", ":number"]);
  return false;
}

function githubApiRepoEndpointCanUseCredential(url: URL, method: string, repo: string): boolean {
  const [owner, name] = repo.toLowerCase().split("/");
  if (!owner || !name) return false;
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.toLowerCase());
  const rest = segments.slice(3);
  if (segments[0] !== "repos" || segments[1] !== owner || segments[2] !== name) return false;
  if (method === "GET" || method === "HEAD") return true;
  if (method === "POST") {
    return (
      pathMatches(rest, ["pulls"]) ||
      pathMatches(rest, ["pulls", ":number", "reviews"]) ||
      pathMatches(rest, ["pulls", ":number", "requested_reviewers"]) ||
      pathMatches(rest, ["issues", ":number", "comments"]) ||
      pathMatches(rest, ["issues", ":number", "labels"]) ||
      pathMatches(rest, ["statuses", ":sha"])
    );
  }
  if (method === "PATCH") {
    return (
      pathMatches(rest, ["pulls", ":number"]) ||
      pathMatches(rest, ["issues", ":number"]) ||
      pathMatches(rest, ["issues", "comments", ":number"]) ||
      pathMatches(rest, ["pulls", "comments", ":number"])
    );
  }
  if (method === "PUT" || method === "DELETE") {
    return (
      pathMatches(rest, ["issues", ":number", "labels", ":label"]) ||
      pathMatches(rest, ["pulls", ":number", "requested_reviewers"])
    );
  }
  return false;
}

function pathMatches(path: string[], pattern: string[]): boolean {
  return (
    path.length === pattern.length &&
    pattern.every((part, index) => {
      const value = path[index] ?? "";
      if (part === ":number") return /^\d+$/.test(value);
      if (part === ":sha") return /^[a-f0-9]{7,64}$/.test(value);
      if (part === ":label") return value.length > 0;
      return value === part;
    })
  );
}

async function githubGraphqlRequestMatchesRepo(
  request: Request,
  repo: string,
  repoNodeId: string | null,
  nodeBelongsToRepo?: (nodeId: string) => Promise<boolean>,
): Promise<boolean> {
  const [owner, name] = repo.toLowerCase().split("/");
  if (!owner || !name) return false;
  const text = await request
    .clone()
    .text()
    .catch(() => "");
  if (!text) return false;
  try {
    const body = JSON.parse(text) as {
      operationName?: unknown;
      query?: unknown;
      variables?: unknown;
    };
    if (typeof body.query !== "string") return false;
    const operationName =
      typeof body.operationName === "string" && body.operationName ? body.operationName : null;
    const operation = selectSingleGraphqlOperation(body.query, operationName);
    if (!operation) return false;
    return graphqlOperationMatchesRepo(
      operation,
      body.variables,
      repo,
      repoNodeId,
      nodeBelongsToRepo,
    );
  } catch {
    return false;
  }
}

function selectSingleGraphqlOperation(query: string, operationName: string | null): string | null {
  const operations = [
    ...query.matchAll(/\b(query|mutation|subscription)\b\s*([A-Za-z_][A-Za-z0-9_]*)?/g),
  ];
  if (operations.some((match) => match[1] === "subscription")) return null;
  if (operations.length > 1) return null;
  if (operations.length === 0) return operationName ? null : query;
  const operation = operations[0];
  if (!operation) return null;
  const name = operation[2] ?? null;
  if (operationName && operationName !== name) return null;
  return query.slice(operation.index ?? 0);
}

async function graphqlOperationMatchesRepo(
  query: string,
  variables: unknown,
  repo: string,
  repoNodeId: string | null,
  nodeBelongsToRepo?: (nodeId: string) => Promise<boolean>,
): Promise<boolean> {
  if (
    graphqlUsesFragments(query) ||
    graphqlSelectionFields(query).some((field) => graphqlFieldsDeniedForRepoToken.has(field))
  ) {
    return false;
  }
  if (/\bmutation\b/i.test(query)) {
    return graphqlMutationMatchesRepo(query, variables, repoNodeId, nodeBelongsToRepo);
  }
  return graphqlQueryMatchesRepo(query, variables, repo);
}

const graphqlMutationFieldsAllowedForRepoToken = new Set([
  "addComment",
  "addLabelsToLabelable",
  "addPullRequestReview",
  "addPullRequestReviewComment",
  "addPullRequestReviewThread",
  "closePullRequest",
  "convertPullRequestToDraft",
  "createPullRequest",
  "disablePullRequestAutoMerge",
  "dismissPullRequestReview",
  "enablePullRequestAutoMerge",
  "markPullRequestReadyForReview",
  "mergePullRequest",
  "removeLabelsFromLabelable",
  "reopenPullRequest",
  "requestReviews",
  "submitPullRequestReview",
  "updateIssueComment",
  "updatePullRequest",
]);

const graphqlQueryRootFieldsAllowedForRepoToken = new Set(["repository", "rateLimit"]);

const graphqlFieldsDeniedForRepoToken = new Set([
  "assignableUsers",
  "collaborators",
  "enterprise",
  "mentionableUsers",
  "organization",
  "owner",
  "repositoryOwner",
  "search",
  "user",
  "viewer",
  "watchers",
]);

function graphqlUsesFragments(query: string): boolean {
  return /\bfragment\b|\.\.\./.test(query);
}

function graphqlQueryMatchesRepo(query: string, variables: unknown, repo: string): boolean {
  const selections = topLevelGraphqlFieldSelections(query);
  if (
    !selections.length ||
    selections.some((selection) => !graphqlQueryRootFieldsAllowedForRepoToken.has(selection.field))
  ) {
    return false;
  }
  const repositorySelections = selections.filter((selection) => selection.field === "repository");
  if (!repositorySelections.length) return false;
  return repositorySelections.every((selection) =>
    graphqlRepositoryArgumentsMatchRepo(selection.args, variables, repo),
  );
}

function graphqlRepositoryArgumentsMatchRepo(
  args: string | null,
  variables: unknown,
  repo: string,
): boolean {
  if (!args) return false;
  const [owner, name] = repo.toLowerCase().split("/");
  if (!owner || !name) return false;
  const record = variableRecord(variables);
  return (
    graphqlStringArgument(args, "owner", record)?.toLowerCase() === owner &&
    graphqlStringArgument(args, "name", record)?.toLowerCase() === name
  );
}

function graphqlStringArgument(
  args: string,
  name: string,
  variables: Record<string, unknown>,
): string | null {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `\\b${escapedName}\\s*:\\s*(?:"([^"]+)"|'([^']+)'|\\$([A-Za-z_][A-Za-z0-9_]*))`,
  ).exec(args);
  if (!match) return null;
  const literal = match[1] ?? match[2] ?? null;
  if (literal) return literal;
  return stringVariable(variables, match[3] ?? null);
}

async function graphqlMutationMatchesRepo(
  query: string,
  variables: unknown,
  repoNodeId: string | null,
  nodeBelongsToRepo?: (nodeId: string) => Promise<boolean>,
): Promise<boolean> {
  const topLevelFields = topLevelGraphqlFields(query);
  if (
    !topLevelFields.length ||
    topLevelFields.some((field) => !graphqlMutationFieldsAllowedForRepoToken.has(field))
  ) {
    return false;
  }
  const repositoryIds = graphqlRepositoryIds(query, variables);
  const hasVerifiedRepositoryIds = repositoryIds.length > 0;
  if (repositoryIds.length) {
    if (!repoNodeId || !repositoryIds.every((id) => id === repoNodeId)) return false;
  }
  const nodeIds = graphqlNodeIds(query, variables);
  if (nodeIds.length) {
    if (!nodeBelongsToRepo) return false;
    return (await Promise.all(nodeIds.map((id) => nodeBelongsToRepo(id)))).every(Boolean);
  }
  return hasVerifiedRepositoryIds;
}

function graphqlRepositoryIds(query: string, variables: unknown): string[] {
  const ids = [
    ...[
      ...query.matchAll(/repositoryId\s*:\s*(?:"([^"]+)"|'([^']+)'|\$([A-Za-z_][A-Za-z0-9_]*))/gi),
    ].flatMap((match) => {
      const literal = match[1] ?? match[2] ?? null;
      if (literal) return [literal];
      return stringVariable(variableRecord(variables), match[3] ?? null) ?? [];
    }),
    ...referencedVariableValues(query, variables).flatMap((value) => repositoryIdsInValue(value)),
  ];
  return [...new Set(ids.filter(Boolean))];
}

function repositoryIdsInValue(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => repositoryIdsInValue(item));
  const ids: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (key === "repositoryId" && typeof child === "string") {
      ids.push(child);
    } else {
      ids.push(...repositoryIdsInValue(child));
    }
  }
  return ids;
}

function graphqlNodeIds(query: string, variables: unknown): string[] {
  const ids = [
    ...[
      ...query.matchAll(
        /\b([A-Za-z_][A-Za-z0-9_]*(?:Id|Ids)|id|ids)\s*:\s*(?:"([^"]+)"|'([^']+)'|\$([A-Za-z_][A-Za-z0-9_]*))/g,
      ),
    ].flatMap((match) => {
      const key = match[1] ?? "";
      if (!graphqlNodeIdKeyNeedsRepoVerification(key)) return [];
      const literal = match[2] ?? match[3] ?? null;
      if (literal) return [literal];
      return stringOrStringArrayVariable(variableRecord(variables), match[4] ?? null);
    }),
    ...referencedVariableValues(query, variables).flatMap((value) => nodeIdsInValue(value)),
  ];
  return [...new Set(ids.filter(Boolean))];
}

function nodeIdsInValue(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap((item) => nodeIdsInValue(item));
  const ids: string[] = [];
  for (const [key, child] of Object.entries(value)) {
    if (!graphqlNodeIdKeyNeedsRepoVerification(key)) {
      ids.push(...nodeIdsInValue(child));
    } else if (typeof child === "string") {
      ids.push(child);
    } else if (Array.isArray(child)) {
      ids.push(...child.filter((item): item is string => typeof item === "string"));
    } else {
      ids.push(...nodeIdsInValue(child));
    }
  }
  return ids;
}

function graphqlNodeIdKeyNeedsRepoVerification(key: string): boolean {
  return (
    (/Id$|Ids$/.test(key) || key === "id" || key === "ids") &&
    !["clientMutationId", "repositoryId"].includes(key)
  );
}

function referencedVariableValues(query: string, variables: unknown): unknown[] {
  const record = variableRecord(variables);
  return [...query.matchAll(/\$([A-Za-z_][A-Za-z0-9_]*)/g)]
    .map((match) => match[1] ?? "")
    .filter((name, index, names) => name && names.indexOf(name) === index)
    .map((name) => record[name]);
}

function variableRecord(variables: unknown): Record<string, unknown> {
  return variables && typeof variables === "object" && !Array.isArray(variables)
    ? (variables as Record<string, unknown>)
    : {};
}

function stringVariable(record: Record<string, unknown>, name: string | null): string | null {
  if (!name) return null;
  const value = record[name];
  return typeof value === "string" ? value : null;
}

function stringOrStringArrayVariable(
  record: Record<string, unknown>,
  name: string | null,
): string[] {
  if (!name) return [];
  const value = record[name];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  return [];
}

type GraphqlFieldSelection = {
  args: string | null;
  field: string;
};

function topLevelGraphqlFields(query: string): string[] {
  return topLevelGraphqlFieldSelections(query).map((selection) => selection.field);
}

function topLevelGraphqlFieldSelections(query: string): GraphqlFieldSelection[] {
  const start = query.indexOf("{");
  if (start === -1) return [];
  const selections: GraphqlFieldSelection[] = [];
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;
  for (let index = start; index < query.length; index += 1) {
    const char = query[index] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth <= 0) break;
      continue;
    }
    if (depth !== 1 || !/[A-Za-z_]/.test(char)) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?/.exec(
      query.slice(index),
    );
    if (!match) continue;
    const field = match[2] ?? match[1] ?? "";
    index += match[0].length - 1;
    let cursor = index + 1;
    while (/\s/.test(query[cursor] ?? "")) cursor += 1;
    let args: string | null = null;
    if (query[cursor] === "(") {
      const end = skipBalancedParens(query, cursor);
      args = query.slice(cursor + 1, end);
      index = end;
    }
    if (field) selections.push({ args, field });
  }
  return selections;
}

function graphqlSelectionFields(query: string): string[] {
  const start = query.indexOf("{");
  if (start === -1) return [];
  const fields: string[] = [];
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;
  for (let index = start; index < query.length; index += 1) {
    const char = query[index] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth <= 0) break;
      continue;
    }
    if (depth < 1 || !/[A-Za-z_]/.test(char)) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?/.exec(
      query.slice(index),
    );
    if (!match) continue;
    const field = match[2] ?? match[1] ?? "";
    if (field) fields.push(field);
    index += match[0].length - 1;
    let cursor = index + 1;
    while (/\s/.test(query[cursor] ?? "")) cursor += 1;
    if (query[cursor] === "(") {
      index = skipBalancedParens(query, cursor);
    }
  }
  return fields;
}

function skipBalancedParens(query: string, start: number): number {
  let depth = 0;
  let inString: string | null = null;
  let escaped = false;
  for (let index = start; index < query.length; index += 1) {
    const char = query[index] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      inString = char;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return start;
}
