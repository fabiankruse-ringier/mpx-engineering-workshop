import { broaderSkills } from "./skills.js";

function normalized(value) {
  return value.trim().toLowerCase();
}

export function scoreJob(job, candidate) {
  const candidateSkills = new Set(candidate.skills.map(normalized));
  const skillBreakdown = job.skills.map((skill) => {
    const requiredSkill = normalized(skill);
    if (candidateSkills.has(requiredSkill)) {
      return { skill, matched: true, matchType: "exact", credit: 1, reason: "Exact skill" };
    }

    // Only a listed specific skill can support its direct broader requirement.
    // Taxonomy order gives a deterministic explanation when several skills qualify.
    const related = Object.entries(broaderSkills).find(([specific, broader]) =>
      candidateSkills.has(normalized(specific)) && broader.some((parent) => normalized(parent) === requiredSkill)
    );
    if (related) {
      return {
        skill,
        matched: false,
        matchType: "related",
        credit: 0.5,
        reason: `Related via ${related[0]} (50% credit)`,
      };
    }

    return { skill, matched: false, matchType: "missing", credit: 0, reason: "Not found" };
  });
  // Preserve the exact-only count used by the inspector.
  const matchedCount = skillBreakdown.filter((item) => item.matched).length;
  const totalCredit = skillBreakdown.reduce((sum, item) => sum + item.credit, 0);
  const skillScore = job.skills.length ? totalCredit / job.skills.length : 0;
  const locationFits = job.location === candidate.location || job.workMode === "Remote";
  const score = Math.round(skillScore * 80 + (locationFits ? 20 : 0));

  return {
    score,
    matchedCount,
    requiredCount: job.skills.length,
    locationFits,
    skillBreakdown,
  };
}

export function rankJobs(jobs, candidate) {
  return jobs
    .map((job) => ({ ...job, match: scoreJob(job, candidate) }))
    .sort((a, b) => b.match.score - a.match.score || a.title.localeCompare(b.title));
}
