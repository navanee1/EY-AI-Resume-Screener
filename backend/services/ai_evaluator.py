import re
from typing import Any


def extract_email(resume_text: str) -> str | None:
    match = re.search(
        r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b",
        resume_text,
    )
    return match.group(0) if match else None


def _contains_skill(resume_text: str, skill: str) -> bool:
    # Match skill names as whole tokens to avoid treating "C" as "C++".
    pattern = rf"(?<![\w+#]){re.escape(skill.strip())}(?![\w+#])"
    return bool(re.search(pattern, resume_text, flags=re.IGNORECASE))


def evaluate_resume(
    resume_text: str,
    job_description: str,
    required_skills: list[str],
    min_experience: float = 0,
) -> dict[str, Any]:
    """Score one resume against one opening without contacting an external LLM."""
    matched_skills = [
        skill for skill in required_skills if _contains_skill(resume_text, skill)
    ]
    missing_skills = [
        skill for skill in required_skills if skill not in matched_skills
    ]

    if required_skills:
        skill_score = len(matched_skills) / len(required_skills) * 100
    else:
        skill_score = 0

    ignored_words = {
        "the", "and", "for", "with", "from", "that", "this", "you",
        "your", "are", "our", "will", "have", "has", "using", "use",
        "work", "years", "experience", "role", "candidate",
    }
    description_words = {
        word.casefold()
        for word in re.findall(r"\b[a-zA-Z][a-zA-Z+#.]*\b", job_description)
        if word.casefold() not in ignored_words
    }
    resume_words = {
        word.casefold()
        for word in re.findall(r"\b[a-zA-Z][a-zA-Z+#.]*\b", resume_text)
    }
    description_score = (
        len(description_words & resume_words) / len(description_words) * 100
        if description_words
        else 0
    )

    experience_match = re.search(
        r"\b(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)(?:\s+of)?\s+"
        r"(?:(?:relevant|professional|work)\s+)?experience\b",
        resume_text,
        flags=re.IGNORECASE,
    )
    years_experience = float(experience_match.group(1)) if experience_match else 0
    experience_score = (
        min(years_experience / min_experience, 1) * 100
        if min_experience > 0
        else 100
    )

    # Required skills carry the most weight; description overlap and experience
    # add context without outweighing the explicit skill requirements.
    score = round(
        skill_score * 0.7
        + description_score * 0.2
        + experience_score * 0.1
    )
    score = max(0, min(score, 100))

    if score >= 75:
        recommendation = "strong"
    elif score >= 45:
        recommendation = "maybe"
    else:
        recommendation = "no"

    experience_detail = (
        f"The resume states {years_experience:g} years of experience against "
        f"a {min_experience:g}-year minimum."
        if min_experience > 0
        else "No minimum experience requirement was specified."
    )
    summary = (
        f"Local mock score: {len(matched_skills)} of {len(required_skills)} "
        f"required skills were found; the score also considers job-description "
        f"word overlap. {experience_detail}"
    )

    return {
        "match_score": score,
        "matched_skills": matched_skills,
        "missing_skills": missing_skills,
        "summary": summary,
        "recommendation": recommendation,
    }
