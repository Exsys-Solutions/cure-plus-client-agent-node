/*
 *
 * `exsysApi`: the one place that knows how to talk to exsys - every GET
 * query endpoint takes ?authorization=... and returns { data: [...] };
 * every DML (insert/update/delete) endpoint takes a POST body of
 * { authorization, data: [...] } where each row's own `record_status` is
 * "n" (insert), "u" (update) or "d" (delete). Every exsys-facing module in
 * this project (fetchPendingJob.mjs, updateDeployJob.mjs,
 * registerSitesWithExsys.mjs) calls through here instead of building its
 * own fetch() calls, so the auth header, base URL, and error handling only
 * exist once.
 *
 */
import { EXSYS_API_BASE_URL, EXSYS_AUTHORIZATION } from "./constants.mjs";

export const exsysGet = async (apiPath) => {
  const response = await fetch(
    `${EXSYS_API_BASE_URL}/${apiPath}?authorization=${EXSYS_AUTHORIZATION}`,
  );

  if (!response.ok) {
    throw new Error(`GET ${apiPath} failed: HTTP ${response.status}`);
  }

  const { data } = await response.json();
  return data || [];
};

export const exsysDml = async (apiPath, rows) => {
  const response = await fetch(`${EXSYS_API_BASE_URL}/${apiPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ authorization: EXSYS_AUTHORIZATION, data: rows }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `POST ${apiPath} failed: HTTP ${response.status} ${text}`,
    );
  }

  return response.json();
};
