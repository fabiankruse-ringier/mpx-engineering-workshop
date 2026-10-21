import assert from "node:assert/strict";
import test from "node:test";
import { scoreJob, rankJobs } from "../server/matching.js";
import { primaryJobs } from "../server/seed-data.js";
import { getCandidateById } from "../server/candidates.js";
import { broaderSkills } from "../server/skills.js";

const localJob = { location: "Bern", workMode: "Hybrid", skills: ["Frontend development"] };
const candidate = { location: "Zurich", skills: ["React"] };

test("exact skill credit is preserved with case and whitespace normalization", () => {
  const result = scoreJob({ ...localJob, skills: [" React "] }, { ...candidate, skills: ["react"] });
  assert.equal(result.score, 80);
  assert.equal(result.matchedCount, 1);
  assert.equal(result.skillBreakdown[0].matchType, "exact");
  assert.equal(result.skillBreakdown[0].credit, 1);
  assert.equal(result.skillBreakdown[0].reason, "Exact skill");
});

test("mixed exact and related skills produce an explainable score", () => {
  const result = scoreJob(primaryJobs[0], getCandidateById("candidate-001"));
  assert.equal(result.score, 90);
  assert.equal(result.matchedCount, 3);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matched), [true, true, true, false]);
  assert.deepEqual(result.skillBreakdown.map((item) => item.credit), [1, 1, 1, 0.5]);
  assert.equal(result.locationFits, true);
});

test("every direct taxonomy relationship earns half credit after normalization", () => {
  for (const [specific, broader] of Object.entries(broaderSkills)) {
    for (const required of broader) {
      const result = scoreJob({ ...localJob, skills: [` ${required.toUpperCase()} `] }, {
        ...candidate, skills: [` ${specific.toLowerCase()} `],
      });
      assert.equal(result.score, 40);
      assert.equal(result.matchedCount, 0);
      assert.equal(result.skillBreakdown[0].matchType, "related");
      assert.equal(result.skillBreakdown[0].credit, 0.5);
      assert.equal(result.skillBreakdown[0].reason, `Related via ${specific} (50% credit)`);
    }
  }
});

test("unrelated, reverse, sibling, and unlisted relationships remain missing", () => {
  for (const [required, possessed] of [
    ["Frontend development", "SQL"], ["React", "Frontend development"],
    ["Python", "TypeScript"], ["Frontend development", "React Native"],
  ]) {
    const result = scoreJob({ ...localJob, skills: [required] }, { ...candidate, skills: [possessed] });
    assert.equal(result.score, 0);
    assert.equal(result.skillBreakdown[0].matchType, "missing");
    assert.equal(result.skillBreakdown[0].credit, 0);
    assert.equal(result.skillBreakdown[0].reason, "Not found");
  }
});

test("exact evidence wins and several related skills do not stack", () => {
  const job = { ...localJob, skills: ["Data engineering"] };
  const related = scoreJob(job, { ...candidate, skills: ["SQL", "Data pipelines", "SQL"] });
  assert.equal(related.score, 40);
  assert.deepEqual(related, scoreJob(job, { ...candidate, skills: ["Data pipelines", "SQL"] }));
  const exact = scoreJob(job, { ...candidate, skills: ["SQL", "Data engineering", "Data pipelines"] });
  assert.equal(exact.score, 80);
  assert.equal(exact.skillBreakdown[0].matchType, "exact");
});

test("a candidate skill can support both an exact and broader requirement", () => {
  const result = scoreJob({ ...localJob, skills: ["React", "Frontend development"] }, candidate);
  assert.equal(result.score, 60);
  assert.equal(result.matchedCount, 1);
  assert.deepEqual(result.skillBreakdown.map((item) => item.matchType), ["exact", "related"]);
});

test("remote and local location fits retain their 20 point contribution", () => {
  assert.equal(scoreJob({ ...localJob, workMode: "Remote" }, candidate).score, 60);
  assert.equal(scoreJob(localJob, { ...candidate, location: "Bern" }).score, 60);
  assert.equal(scoreJob(localJob, candidate).score, 40);
});

test("scores reconstruct from the breakdown, stay bounded, and are repeatable", () => {
  for (const skills of [[], ["React"], ["Frontend development"], ["SQL"], ["React", "Frontend development", "SQL"]]) {
    for (const workMode of ["Hybrid", "Remote"]) {
      const job = { ...localJob, skills, workMode };
      const result = scoreJob(job, candidate);
      const credit = result.skillBreakdown.reduce((sum, item) => sum + item.credit, 0);
      const expected = Math.round((skills.length ? credit / skills.length : 0) * 80 + (result.locationFits ? 20 : 0));
      assert.equal(result.score, expected);
      assert.ok(result.score >= 0 && result.score <= 100);
      assert.deepEqual(result, scoreJob(job, candidate));
    }
  }
  assert.equal(scoreJob({ ...localJob, skills: ["React"] }, { ...candidate, location: "Bern" }).score, 100);
});

test("equal scores retain alphabetical title ordering without mutating input", () => {
  const jobs = [{ ...localJob, title: "Zulu" }, { ...localJob, title: "Alpha" }];
  assert.deepEqual(rankJobs(jobs, candidate).map((job) => job.title), ["Alpha", "Zulu"]);
  assert.deepEqual(jobs.map((job) => job.title), ["Zulu", "Alpha"]);
});

test("remote roles count as a location fit and ranking is stable", () => {
  const candidate = getCandidateById("candidate-003");
  const ranked = rankJobs(primaryJobs, candidate);
  assert.equal(ranked[0].id, "job-103");
  assert.equal(ranked[0].match.locationFits, true);
});
