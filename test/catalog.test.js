import assert from "node:assert/strict";
import test from "node:test";
import { getCatalogSummary, getJobById, listJobs } from "../server/catalog.js";
import { primaryJobs, partnerJobs } from "../server/seed-data.js";

test("catalog deduplicates canonical roles and prefers the direct record", () => {
  const jobs = listJobs();
  const copies = jobs.filter((job) => job.canonicalId === "role-101");
  assert.deepEqual(copies, [primaryJobs[0]]);
  assert.equal(new Set(jobs.map((job) => job.canonicalId)).size, jobs.length);
  assert.deepEqual(getCatalogSummary(), { visibleListings: 7, uniqueRoles: 7, partnerListings: 1 });
});

test("deduplication preserves source order and partner-only roles without changing feeds", () => {
  const before = structuredClone({ primaryJobs, partnerJobs });
  const expected = [...primaryJobs, partnerJobs[1]];
  assert.deepEqual(listJobs(), expected);
  assert.deepEqual(listJobs(), expected);
  assert.deepEqual({ primaryJobs, partnerJobs }, before);
  assert.equal(getJobById("partner-779")?.canonicalId, "role-107");
});

test("duplicate stays removed under search and combined filters", () => {
  const filters = { query: " senior PRODUCT engineer ", category: "Engineering", location: "Zurich" };
  assert.deepEqual(listJobs(filters), [primaryJobs[0]]);
  assert.deepEqual(listJobs({ query: "Senior Product Engineer" }), [primaryJobs[0]]);
  assert.deepEqual(listJobs({ ...filters, category: "Data" }), []);
});

test("filters preserve matching fields and remote location behavior after deduplication", () => {
  const jobs = listJobs();
  for (const query of ["Northstar", "trustworthy", "Figma"]) {
    const expected = jobs.filter((job) => [job.title, job.company, job.description, ...job.skills]
      .some((value) => value.toLowerCase().includes(query.toLowerCase())));
    assert.ok(expected.length > 0);
    assert.deepEqual(listJobs({ query }), expected);
  }
  assert.deepEqual(listJobs({ category: "Engineering", location: "Bern" }).map((job) => job.id), ["job-104", "job-106"]);
});

test("catalog can filter by query, category, and location", () => {
  assert.equal(listJobs({ query: "Security" }).length, 1);
  assert.equal(listJobs({ category: "Data" }).length, 1);
  assert.equal(listJobs({ location: "Lausanne" }).some((job) => job.id === "job-103"), true);
  assert.equal(listJobs({ location: "Bern" }).some((job) => job.id === "job-106"), true);
  assert.equal(getJobById("job-102")?.title, "Data Platform Engineer");
});
