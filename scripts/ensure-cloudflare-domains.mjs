const token = process.env.CLOUDFLARE_API_TOKEN;
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID || "91b59577e757131d68d55a471fe32aca";

if (!token) {
  throw new Error("CLOUDFLARE_API_TOKEN is required");
}

async function request(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || body.success === false) {
    const message =
      body.errors?.map((error) => `${error.code}: ${error.message}`).join("; ") ||
      response.statusText;
    throw new Error(`${init.method || "GET"} ${path}: ${response.status} ${message}`);
  }
  return body.result;
}

async function zone(name) {
  const zones = await request(`/zones?name=${encodeURIComponent(name)}`);
  const selected = zones[0];
  if (!selected) {
    throw new Error(`Cloudflare zone not found: ${name}`);
  }
  return selected;
}

async function ensureCrabfleetRoute() {
  const crabfleet = await zone("crabfleet.ai");
  const dns = await request(
    `/zones/${crabfleet.id}/dns_records?name=${encodeURIComponent("crabfleet.ai")}`,
  );
  const addressable = dns.filter((record) => ["A", "AAAA", "CNAME"].includes(record.type));
  if (!addressable.length) {
    await request(`/zones/${crabfleet.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: "crabfleet.ai",
        content: "192.0.2.1",
        proxied: true,
        ttl: 1,
      }),
    });
    console.log("created crabfleet.ai proxied placeholder");
  } else {
    for (const record of addressable.filter((entry) => !entry.proxied)) {
      await request(`/zones/${crabfleet.id}/dns_records/${record.id}`, {
        method: "PUT",
        body: JSON.stringify({
          type: record.type,
          name: record.name,
          content: record.content,
          proxied: true,
          ttl: 1,
        }),
      });
      console.log(`proxied crabfleet.ai ${record.type} record ${record.id}`);
    }
  }

  const routes = await request(`/zones/${crabfleet.id}/workers/routes`);
  for (const route of routes.filter(
    (entry) => entry.pattern === "crabfleet.ai/*" && entry.script !== "crabbox-ai",
  )) {
    await request(`/zones/${crabfleet.id}/workers/routes/${route.id}`, { method: "DELETE" });
    console.log(`deleted stale crabfleet.ai route ${route.id}`);
  }
  const current = await request(`/zones/${crabfleet.id}/workers/routes`);
  if (
    !current.some((route) => route.pattern === "crabfleet.ai/*" && route.script === "crabbox-ai")
  ) {
    const route = await request(`/zones/${crabfleet.id}/workers/routes`, {
      method: "POST",
      body: JSON.stringify({ pattern: "crabfleet.ai/*", script: "crabbox-ai" }),
    });
    console.log(`created crabfleet.ai route ${route.id}`);
  } else {
    console.log("crabfleet.ai route ok");
  }
}

async function removeOldOpenClawHosts() {
  const oldHosts = new Set(["crabfleet.openclaw.ai", "crabyard.openclaw.ai"]);

  const openclaw = await zone("openclaw.ai");
  const routes = await request(`/zones/${openclaw.id}/workers/routes`);
  for (const route of routes.filter((entry) => {
    const host = entry.pattern.replace(/\/\*$/, "");
    return oldHosts.has(host);
  })) {
    await request(`/zones/${openclaw.id}/workers/routes/${route.id}`, { method: "DELETE" });
    console.log(`deleted old OpenClaw route ${route.pattern}`);
  }

  const domains = await request(
    `/accounts/${accountId}/workers/scripts/crabbox-ai/domains/records`,
  );
  for (const domain of domains.filter((entry) => oldHosts.has(entry.hostname))) {
    await request(
      `/accounts/${accountId}/workers/scripts/crabbox-ai/domains/records/${domain.id}`,
      {
        method: "DELETE",
      },
    );
    console.log(`deleted old OpenClaw custom domain ${domain.hostname}`);
  }
}

async function ensureCrabdSshRecord() {
  const crabd = await zone("crabd.sh");
  const records = await request(
    `/zones/${crabd.id}/dns_records?name=${encodeURIComponent("crabd.sh")}`,
  );

  const target = "87.99.128.60";
  for (const record of records.filter((entry) => entry.type === "AAAA" || entry.type === "CNAME")) {
    await request(`/zones/${crabd.id}/dns_records/${record.id}`, { method: "DELETE" });
    console.log(`deleted conflicting crabd.sh ${record.type} record ${record.id}`);
  }

  const refreshed = await request(
    `/zones/${crabd.id}/dns_records?name=${encodeURIComponent("crabd.sh")}`,
  );
  const [primaryA, ...extraARecords] = refreshed.filter((record) => record.type === "A");
  if (primaryA) {
    await request(`/zones/${crabd.id}/dns_records/${primaryA.id}`, {
      method: "PUT",
      body: JSON.stringify({
        type: "A",
        name: "crabd.sh",
        content: target,
        proxied: false,
        ttl: 1,
      }),
    });
    console.log("set crabd.sh A record to SSH gateway");
  } else {
    await request(`/zones/${crabd.id}/dns_records`, {
      method: "POST",
      body: JSON.stringify({
        type: "A",
        name: "crabd.sh",
        content: target,
        proxied: false,
        ttl: 1,
      }),
    });
    console.log("created crabd.sh SSH A record");
  }

  for (const record of extraARecords) {
    await request(`/zones/${crabd.id}/dns_records/${record.id}`, { method: "DELETE" });
    console.log(`deleted extra crabd.sh A record ${record.id}`);
  }
}

await ensureCrabfleetRoute();
await removeOldOpenClawHosts();
await ensureCrabdSshRecord();
