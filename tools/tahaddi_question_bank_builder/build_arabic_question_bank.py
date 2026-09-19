#!/usr/bin/env python3
"""Build a reviewed Arabic question bank and Tahaddi-compatible SQL export."""

from __future__ import annotations

import argparse
import csv
import hashlib
import ipaddress
import io
import json
import re
import socket
import sys
import unicodedata
import urllib.request
from urllib.parse import urlsplit, urlunsplit
from dataclasses import asdict, dataclass, replace
from pathlib import Path
from typing import Any, Iterable, Iterator, Mapping, Sequence


DIACRITICS_RE = re.compile(r"[\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed]")
NON_WORD_RE = re.compile(r"[^\w\u0600-\u06ff]+", re.UNICODE)
SPACE_RE = re.compile(r"\s+")
YEAR_RE = re.compile(r"^(?:1[0-9]{3}|20[0-9]{2}|[٠-٩]{4})$")

DIFFICULTY_MAP = {
    "easy": "EASY",
    "سهل": "EASY",
    "medium": "MEDIUM",
    "متوسط": "MEDIUM",
    "hard": "HARD",
    "صعب": "HARD",
}

CATEGORY_RULES = (
    ("جغرافيا", ("عاصمة", "دولة", "مدينة", "قارة", "بحر", "نهر", "جبل")),
    ("علوم", ("كوكب", "عنصر", "ذره", "حيوان", "نبات", "جسم الانسان", "فيزياء")),
    ("تاريخ", ("تاسست", "معركة", "خليفة", "ملك", "حضارة", "تاريخ")),
    ("أدب ولغة", ("مولف", "شاعر", "رواية", "كتاب", "لغة", "جمع كلمة")),
    ("رياضة", ("كاس", "منتخب", "نادي", "بطولة", "لاعب")),
)

FAMILY_RULES = (
    ("capital", ("ما عاصمة", "ما هي عاصمة", "عاصمة اي")),
    ("country", ("في اي دولة", "ما الدولة", "الي اي دولة")),
    ("author", ("من مولف", "من كتب", "كاتب كتاب")),
    ("founder", ("من موسس", "من اسس")),
    ("year", ("في اي عام", "في اي سنة", "متى")),
    ("largest", ("ما اكبر", "اي اكبر")),
    ("smallest", ("ما اصغر", "اي اصغر")),
    ("longest", ("ما اطول", "اي اطول")),
    ("element", ("ما العنصر", "رمز العنصر")),
    ("planet", ("ما الكوكب", "اي كوكب")),
)

GAME_PROFILES = (
    ("parallel-world", "العالم الموازي", True, "multiple_choice"),
    ("reverse-time", "الزمن المقلوب", True, "answer_prompt"),
    ("infiltrator", "الدخيل", True, "paired_prompts"),
    ("chess", "الشطرنج", False, "board_game"),
    ("category-board", "لوحة الفئات", True, "category_board"),
    ("millionaire", "من سيربح المليون", True, "millionaire_ladder"),
    ("baloot", "البلوت", False, "card_game"),
    ("memory-flash", "ومضة الذاكرة", False, "sequence_game"),
    ("word-code", "شفرة الحروف", True, "single_word"),
    ("color-rush", "خدعة الألوان", False, "reaction_game"),
    ("letter-challenge", "تحدي الحروف", True, "answer_letter"),
)

ARABIC_GAME_LETTERS = frozenset("ابتثجحخدذرزسشصضطظعغفقكلمن")
MILLIONAIRE_VALUES = (
    100,
    200,
    300,
    500,
    1_000,
    2_000,
    4_000,
    8_000,
    16_000,
    32_000,
    64_000,
    125_000,
    250_000,
    500_000,
    1_000_000,
)


@dataclass(frozen=True)
class QuestionRecord:
    prompt: str
    answer: str
    options: tuple[str, ...] = ()
    category: str = ""
    difficulty: str = "MEDIUM"
    explanation: str = ""
    source: str = ""
    license: str = ""
    time_limit: int = 20
    base_points: int = 1000
    correct_option: int = -1
    review_reason: str = ""

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["options"] = list(self.options)
        return data


def normalize_arabic(value: str) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).strip().lower()
    text = DIACRITICS_RE.sub("", text).replace("ـ", "")
    text = text.translate(
        str.maketrans(
            {
                "أ": "ا",
                "إ": "ا",
                "آ": "ا",
                "ٱ": "ا",
                "ؤ": "و",
                "ئ": "ي",
                "ى": "ي",
                "؟": " ",
                "،": " ",
                "؛": " ",
                "٠": "0",
                "١": "1",
                "٢": "2",
                "٣": "3",
                "٤": "4",
                "٥": "5",
                "٦": "6",
                "٧": "7",
                "٨": "8",
                "٩": "9",
                "۰": "0",
                "۱": "1",
                "۲": "2",
                "۳": "3",
                "۴": "4",
                "۵": "5",
                "۶": "6",
                "۷": "7",
                "۸": "8",
                "۹": "9",
            }
        )
    )
    text = NON_WORD_RE.sub(" ", text).replace("_", " ")
    return SPACE_RE.sub(" ", text).strip()


def stable_id(prefix: str, record: QuestionRecord, suffix: str = "") -> str:
    identity = "\x1f".join(
        (normalize_arabic(record.prompt), normalize_arabic(record.answer), normalize_arabic(record.source), suffix)
    )
    return f"{prefix}_{hashlib.sha256(identity.encode('utf-8')).hexdigest()[:24]}"


def infer_category(prompt: str) -> str:
    normalized = normalize_arabic(prompt)
    for category, keywords in CATEGORY_RULES:
        if any(keyword in normalized for keyword in keywords):
            return category
    return "عام"


def normalize_difficulty(value: str) -> str:
    clean = normalize_arabic(value)
    if clean.upper() in {"EASY", "MEDIUM", "HARD"}:
        return clean.upper()
    return DIFFICULTY_MAP.get(clean, "MEDIUM")


def question_family(prompt: str) -> str:
    normalized = normalize_arabic(prompt)
    for family, patterns in FAMILY_RULES:
        if any(pattern in normalized for pattern in patterns):
            return family
    return ""


def answer_kind(answer: str) -> str:
    normalized = normalize_arabic(answer)
    if YEAR_RE.fullmatch(normalized):
        return "year"
    if normalized.isdigit():
        return "number"
    words = normalized.split()
    if len(words) >= 2:
        return "phrase"
    return "word"


def dedupe_records(records: Iterable[QuestionRecord]) -> tuple[list[QuestionRecord], int]:
    unique: list[QuestionRecord] = []
    seen: set[tuple[str, str]] = set()
    removed = 0
    for record in records:
        key = (normalize_arabic(record.prompt), normalize_arabic(record.answer))
        if key in seen:
            removed += 1
            continue
        seen.add(key)
        unique.append(record)
    return unique, removed


def _unique_texts(values: Iterable[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for raw in values:
        text = SPACE_RE.sub(" ", str(raw or "")).strip()
        key = normalize_arabic(text)
        if text and key and key not in seen:
            seen.add(key)
            result.append(text)
    return result


def _trusted_source_options(record: QuestionRecord) -> list[str]:
    options = _unique_texts(record.options)
    answer_key = normalize_arabic(record.answer)
    matching = [option for option in options if normalize_arabic(option) == answer_key]
    if len(matching) != 1 or len(options) < 4:
        return []
    distractors = [option for option in options if normalize_arabic(option) != answer_key]
    return [record.answer, *distractors[:3]] if len(distractors) >= 3 else []


def _candidate_distractors(record: QuestionRecord, corpus: Sequence[QuestionRecord]) -> list[str]:
    family = question_family(record.prompt)
    if not family:
        return []
    category = normalize_arabic(record.category or infer_category(record.prompt))
    kind = answer_kind(record.answer)
    answer_key = normalize_arabic(record.answer)
    candidates: list[tuple[int, str, str]] = []
    for candidate in corpus:
        candidate_key = normalize_arabic(candidate.answer)
        if not candidate_key or candidate_key == answer_key or len(candidate.answer.strip()) > 500:
            continue
        if question_family(candidate.prompt) != family:
            continue
        candidate_category = normalize_arabic(candidate.category or infer_category(candidate.prompt))
        score = 100
        score += 30 if candidate_category == category else 0
        score += 20 if answer_kind(candidate.answer) == kind else 0
        score -= abs(len(candidate_key) - len(answer_key))
        candidates.append((score, candidate_key, candidate.answer.strip()))

    best: dict[str, tuple[int, str]] = {}
    for score, key, text in candidates:
        previous = best.get(key)
        if previous is None or score > previous[0]:
            best[key] = (score, text)
    ordered = sorted(best.values(), key=lambda item: (-item[0], normalize_arabic(item[1])))
    return [text for _, text in ordered[:3]]


def _deterministic_options(record: QuestionRecord, values: Sequence[str]) -> tuple[str, ...]:
    seed = stable_id("seed", record)
    return tuple(
        sorted(
            values,
            key=lambda value: hashlib.sha256(f"{seed}\x1f{normalize_arabic(value)}".encode("utf-8")).hexdigest(),
        )
    )


def _validation_reason(record: QuestionRecord) -> str:
    if not (8 <= len(record.prompt.strip()) <= 1000):
        return "invalid_prompt_length"
    if not record.answer.strip() or len(record.answer.strip()) > 500:
        return "invalid_answer_length"
    if any(not option.strip() or len(option.strip()) > 500 for option in record.options):
        return "invalid_option_length"
    if len((record.category or "").strip()) > 120:
        return "invalid_category_length"
    if len((record.explanation or "").strip()) > 2000:
        return "invalid_explanation_length"
    if len(_source_label(record)) > 500:
        return "invalid_source_length"
    if not 5 <= int(record.time_limit) <= 300:
        return "invalid_time_limit"
    if not 100 <= int(record.base_points) <= 10000:
        return "invalid_base_points"
    return ""


def build_questions(records: Iterable[QuestionRecord]) -> tuple[list[QuestionRecord], list[QuestionRecord]]:
    corpus, _ = dedupe_records(records)
    prompt_answers: dict[str, set[str]] = {}
    for record in corpus:
        prompt_answers.setdefault(normalize_arabic(record.prompt), set()).add(normalize_arabic(record.answer))

    ready: list[QuestionRecord] = []
    review: list[QuestionRecord] = []
    for raw in corpus:
        record = replace(
            raw,
            category=(raw.category or infer_category(raw.prompt)).strip(),
            difficulty=normalize_difficulty(raw.difficulty),
            prompt=raw.prompt.strip(),
            answer=raw.answer.strip(),
        )
        reason = _validation_reason(record)
        if not reason and len(prompt_answers[normalize_arabic(record.prompt)]) > 1:
            reason = "conflicting_correct_answers"
        if reason:
            review.append(replace(record, review_reason=reason))
            continue

        choices = _trusted_source_options(record)
        if not choices:
            distractors = _candidate_distractors(record, corpus)
            if len(distractors) < 3:
                review.append(replace(record, review_reason="insufficient_trusted_distractors"))
                continue
            choices = [record.answer, *distractors]

        options = _deterministic_options(record, choices)
        answer_key = normalize_arabic(record.answer)
        correct_indexes = [index for index, option in enumerate(options) if normalize_arabic(option) == answer_key]
        if len(options) != 4 or len(correct_indexes) != 1:
            review.append(replace(record, review_reason="invalid_generated_options"))
            continue
        ready.append(replace(record, options=options, correct_option=correct_indexes[0], review_reason=""))
    return ready, review


def _parse_options(value: Any) -> tuple[str, ...]:
    if isinstance(value, (list, tuple)):
        return tuple(str(item) for item in value)
    if not value:
        return ()
    text = str(value).strip()
    if text.startswith("["):
        try:
            parsed = json.loads(text)
            if isinstance(parsed, list):
                return tuple(str(item) for item in parsed)
        except json.JSONDecodeError:
            pass
    separator = "|" if "|" in text else ";"
    return tuple(part.strip() for part in text.split(separator) if part.strip())


def record_from_mapping(row: Mapping[str, Any], metadata: Mapping[str, Any] | None = None) -> QuestionRecord:
    metadata = metadata or {}
    prompt = row.get("prompt") or row.get("question") or row.get("text") or ""
    options = _parse_options(row.get("options") or row.get("choices"))
    answer = row.get("answer") or row.get("correct_answer") or row.get("correctAnswer") or ""
    if not answer and options:
        index = row.get("correct_option", row.get("correctOption", -1))
        index_base = _safe_int(row.get("correct_index_base", metadata.get("correct_index_base", 0)), 0)
        try:
            answer = options[int(index) - index_base]
        except (TypeError, ValueError, IndexError):
            answer = ""
    return QuestionRecord(
        prompt=str(prompt),
        answer=str(answer),
        options=options,
        category=str(row.get("category") or metadata.get("category") or ""),
        difficulty=str(row.get("difficulty") or metadata.get("difficulty") or "MEDIUM"),
        explanation=str(row.get("explanation") or ""),
        source=str(row.get("source") or metadata.get("name") or metadata.get("source") or ""),
        license=str(row.get("license") or row.get("licence") or metadata.get("license") or ""),
        time_limit=_safe_int(row.get("time_limit", row.get("timeLimit", 20)), 20),
        base_points=_safe_int(row.get("base_points", row.get("basePoints", 1000)), 1000),
    )


def _safe_int(value: Any, fallback: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return fallback


def _validate_remote_url(location: str, allow_private_network: bool = False) -> None:
    parts = urlsplit(location)
    if parts.username or parts.password:
        raise ValueError("source URL must not contain credentials")
    hostname = parts.hostname
    if not hostname:
        raise ValueError("source URL must contain a hostname")
    if allow_private_network:
        return
    if hostname.lower() == "localhost":
        raise ValueError("private network sources require --allow-private-network")
    try:
        addresses = {item[4][0] for item in socket.getaddrinfo(hostname, parts.port or 443, type=socket.SOCK_STREAM)}
    except socket.gaierror as error:
        raise ValueError(f"could not resolve source hostname: {hostname}") from error
    if not addresses or any(not ipaddress.ip_address(address).is_global for address in addresses):
        raise ValueError("private network sources require --allow-private-network")


def _redact_location(location: str) -> str:
    if not location.startswith(("https://", "http://")):
        return location
    parts = urlsplit(location)
    hostname = parts.hostname or ""
    netloc = hostname
    if parts.port:
        netloc = f"{hostname}:{parts.port}"
    return urlunsplit((parts.scheme, netloc, parts.path, "", ""))


def _read_source_text(location: str, allow_private_network: bool = False) -> str:
    if location.startswith(("https://", "http://")):
        _validate_remote_url(location, allow_private_network)
        request = urllib.request.Request(location, headers={"User-Agent": "TahaddiQuestionBankBuilder/1.0"})
        with urllib.request.urlopen(request, timeout=45) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset)
    return Path(location).read_text(encoding="utf-8-sig")


def _iter_rows(text: str, source_format: str) -> Iterator[Mapping[str, Any]]:
    if source_format == "jsonl":
        for line_number, line in enumerate(text.splitlines(), 1):
            if line.strip():
                value = json.loads(line)
                if not isinstance(value, Mapping):
                    raise ValueError(f"JSONL line {line_number} is not an object")
                yield value
        return
    if source_format == "csv":
        yield from csv.DictReader(io.StringIO(text))
        return
    payload = json.loads(text)
    if isinstance(payload, Mapping):
        for key in ("questions", "data", "items"):
            if key in payload:
                payload = payload[key]
                break
        else:
            raise ValueError("JSON source must contain questions, data, or items")
    if not isinstance(payload, list):
        raise ValueError("JSON source must contain a list of questions")
    for value in payload:
        if isinstance(value, Mapping):
            yield value


def load_source(
    location: str,
    metadata: Mapping[str, Any] | None = None,
    allow_private_network: bool = False,
) -> list[QuestionRecord]:
    metadata = metadata or {}
    source_format = str(metadata.get("format") or "").lower()
    if not source_format:
        clean = location.split("?", 1)[0].lower()
        source_format = "jsonl" if clean.endswith((".jsonl", ".ndjson")) else "csv" if clean.endswith(".csv") else "json"
    text = _read_source_text(location, allow_private_network)
    return [record_from_mapping(row, metadata) for row in _iter_rows(text, source_format)]


def load_manifest(path: Path) -> list[tuple[str, Mapping[str, Any]]]:
    payload = json.loads(path.read_text(encoding="utf-8-sig"))
    entries = payload.get("sources", []) if isinstance(payload, Mapping) else payload
    if not isinstance(entries, list):
        raise ValueError("sources manifest must contain a list")
    result: list[tuple[str, Mapping[str, Any]]] = []
    for entry in entries:
        if isinstance(entry, str):
            result.append((entry, {}))
        elif isinstance(entry, Mapping):
            location = entry.get("url") or entry.get("path") or entry.get("location")
            if location:
                location = str(location)
                if not location.startswith(("https://", "http://")):
                    location = str((path.parent / location).resolve())
                result.append((location, entry))
    return result


def _source_label(record: QuestionRecord) -> str:
    parts = [record.source.strip()]
    if record.license.strip():
        parts.append(f"License: {record.license.strip()}")
    return " | ".join(part for part in parts if part)


def _sql_literal(value: str | None) -> str:
    if value is None or value == "":
        return "NULL"
    return "'" + value.replace("'", "''") + "'"


def _sql_owner_scoped_id(prefix: str, record: QuestionRecord, suffix: str = "") -> str:
    seed = stable_id(prefix, record, suffix)
    owner = "current_setting('tahaddi.import_owner_id')"
    return f"('{prefix}_' || substr(md5({owner} || ':' || {_sql_literal(seed)}), 1, 24))"


def render_sql(records: Sequence[QuestionRecord]) -> str:
    lines = [
        "-- Tahaddi question-bank import. Run with: psql -v owner_id='USER_ID' -f import_questions.sql",
        "-- All imported questions remain DRAFT for editorial review.",
        r"\if :{?owner_id}",
        r"\else",
        r"\echo 'Missing owner_id. Use: psql -v owner_id=USER_ID -f import_questions.sql'",
        r"\quit",
        r"\endif",
        "BEGIN;",
        "SELECT set_config('tahaddi.import_owner_id', :'owner_id', false);",
        "DO $owner_check$",
        "BEGIN",
        "  IF NOT EXISTS (SELECT 1 FROM \"User\" WHERE \"id\" = current_setting('tahaddi.import_owner_id') AND \"status\" = 'ACTIVE'::\"UserStatus\") THEN",
        "    RAISE EXCEPTION 'owner_id must identify an ACTIVE user';",
        "  END IF;",
        "END",
        "$owner_check$;",
        "",
    ]
    for record in sorted(records, key=lambda item: stable_id("qbq", item)):
        question_id = _sql_owner_scoped_id("qbq", record)
        values = [
            question_id,
            "current_setting('tahaddi.import_owner_id')",
            "'MULTIPLE_CHOICE'::\"QuestionType\"",
            "'DRAFT'::\"QuestionStatus\"",
            f"'{record.difficulty}'::\"QuestionDifficulty\"",
            _sql_literal(record.prompt),
            "NULL",
            _sql_literal(record.explanation),
            _sql_literal(record.category),
            _sql_literal(_source_label(record)),
            str(record.time_limit),
            str(record.base_points),
            "NULL",
            "CURRENT_TIMESTAMP",
            "CURRENT_TIMESTAMP",
        ]
        lines.extend(
            [
                'INSERT INTO "Question" ("id", "ownerId", "type", "status", "difficulty", "prompt", "imageUrl", "explanation", "category", "source", "timeLimit", "basePoints", "archivedAt", "createdAt", "updatedAt")',
                "SELECT " + ", ".join(values),
                'WHERE NOT EXISTS (SELECT 1 FROM "Question" WHERE "ownerId" = current_setting(\'tahaddi.import_owner_id\') AND "prompt" = ' + _sql_literal(record.prompt) + ")",
                "ON CONFLICT DO NOTHING;",
                'DELETE FROM "QuestionOption"',
                f'WHERE "questionId" = {question_id}',
                f'  AND EXISTS (SELECT 1 FROM "Question" WHERE "id" = {question_id} AND "ownerId" = current_setting(\'tahaddi.import_owner_id\') AND "status" = \'DRAFT\'::"QuestionStatus");',
            ]
        )
        for position, option in enumerate(record.options):
            option_id = _sql_owner_scoped_id("qbo", record, str(position))
            lines.extend(
                [
                    'INSERT INTO "QuestionOption" ("id", "questionId", "position", "text", "isCorrect")',
                    f"SELECT {option_id}, {question_id}, {position}, {_sql_literal(option)}, {'TRUE' if position == record.correct_option else 'FALSE'}",
                    f'WHERE EXISTS (SELECT 1 FROM "Question" WHERE "id" = {question_id} AND "ownerId" = current_setting(\'tahaddi.import_owner_id\') AND "status" = \'DRAFT\'::"QuestionStatus")',
                    "ON CONFLICT DO NOTHING;",
                ]
            )
        lines.append("")
    lines.extend(["COMMIT;", ""])
    return "\n".join(lines)


def _game_question_base(record: QuestionRecord) -> dict[str, Any]:
    return {
        "id": stable_id("qbq", record),
        "prompt": record.prompt,
        "answer": record.answer,
        "category": record.category,
        "difficulty": record.difficulty,
        "explanation": record.explanation,
        "source": record.source,
        "license": record.license,
    }


def _millionaire_level(record: QuestionRecord) -> int:
    offset = {"EASY": 0, "MEDIUM": 5, "HARD": 10}[record.difficulty]
    bucket = int(stable_id("level", record).rsplit("_", 1)[1][:8], 16) % 5
    return offset + bucket + 1


def _answer_letter(answer: str) -> str:
    normalized = normalize_arabic(answer).replace(" ", "")
    if not normalized:
        return ""
    if normalized.startswith("ال") and len(normalized) > 2:
        normalized = normalized[2:]
    letter = normalized[0]
    return "أ" if letter == "ا" else letter


def build_game_splits(records: Sequence[QuestionRecord]) -> tuple[dict[str, list[dict[str, Any]]], list[dict[str, Any]]]:
    splits = {slug: [] for slug, _title, _uses_questions, _format in GAME_PROFILES}
    paired_groups: dict[tuple[str, str], list[QuestionRecord]] = {}

    for record in records:
        base = _game_question_base(record)
        multiple_choice = {
            **base,
            "options": list(record.options),
            "correctOption": record.correct_option,
            "timeLimit": record.time_limit,
            "basePoints": record.base_points,
        }
        splits["parallel-world"].append(multiple_choice)
        splits["reverse-time"].append(
            {
                **base,
                "hint": record.explanation or f"الفئة: {record.category}",
            }
        )
        splits["category-board"].append(
            {
                **base,
                "value": {"EASY": 200, "MEDIUM": 400, "HARD": 600}[record.difficulty],
                "note": record.explanation,
            }
        )
        level = _millionaire_level(record)
        splits["millionaire"].append(
            {
                **multiple_choice,
                "level": level,
                "value": MILLIONAIRE_VALUES[level - 1],
                "answerIndex": record.correct_option,
            }
        )
        normalized_answer = normalize_arabic(record.answer)
        if len(normalized_answer.split()) == 1 and normalized_answer.isalpha():
            splits["word-code"].append(
                {
                    **base,
                    "hint": record.prompt,
                }
            )
        letter = _answer_letter(record.answer)
        if letter in ARABIC_GAME_LETTERS:
            splits["letter-challenge"].append({**base, "letter": letter})

        family = question_family(record.prompt)
        if family:
            paired_groups.setdefault((normalize_arabic(record.category), family), []).append(record)

    for grouped_records in paired_groups.values():
        ordered = sorted(grouped_records, key=lambda item: stable_id("qbq", item))
        for index in range(0, len(ordered) - 1, 2):
            majority, infiltrator = ordered[index : index + 2]
            pair_key = f"{stable_id('qbq', majority)}:{stable_id('qbq', infiltrator)}"
            splits["infiltrator"].append(
                {
                    "id": f"pair_{hashlib.sha256(pair_key.encode('utf-8')).hexdigest()[:24]}",
                    "category": majority.category,
                    "majorityPrompt": majority.prompt,
                    "infiltratorPrompt": infiltrator.prompt,
                    "majorityAnswer": majority.answer,
                    "infiltratorAnswer": infiltrator.answer,
                    "source": [majority.source, infiltrator.source],
                    "license": [majority.license, infiltrator.license],
                }
            )

    for entries in splits.values():
        entries.sort(key=lambda item: str(item.get("id", "")))
    manifest = [
        {
            "slug": slug,
            "title": title,
            "usesQuestionBank": uses_questions,
            "format": game_format,
            "count": len(splits[slug]),
            "status": "ready" if uses_questions else "not_applicable",
        }
        for slug, title, uses_questions, game_format in GAME_PROFILES
    ]
    return splits, manifest


CSV_FIELDS = (
    "id",
    "prompt",
    "answer",
    "options",
    "correct_option",
    "category",
    "difficulty",
    "explanation",
    "source",
    "license",
    "time_limit",
    "base_points",
    "review_reason",
)


def _export_row(record: QuestionRecord) -> dict[str, Any]:
    data = record.to_dict()
    data["id"] = stable_id("qbq", record)
    data["options"] = json.dumps(data["options"], ensure_ascii=False)
    return {field: data.get(field, "") for field in CSV_FIELDS}


def write_outputs(output: Path, ready: Sequence[QuestionRecord], review: Sequence[QuestionRecord], report: Mapping[str, Any]) -> None:
    output.mkdir(parents=True, exist_ok=True)
    for name, records in (("questions_ready", ready), ("questions_review", review)):
        with (output / f"{name}.jsonl").open("w", encoding="utf-8") as handle:
            for record in records:
                data = record.to_dict()
                data["id"] = stable_id("qbq", record)
                handle.write(json.dumps(data, ensure_ascii=False, sort_keys=True) + "\n")
        with (output / f"{name}.csv").open("w", encoding="utf-8-sig", newline="") as handle:
            writer = csv.DictWriter(handle, fieldnames=CSV_FIELDS)
            writer.writeheader()
            writer.writerows(_export_row(record) for record in records)
    (output / "import_questions.sql").write_text(render_sql(ready), encoding="utf-8")
    game_splits, game_manifest = build_game_splits(ready)
    games_output = output / "games"
    games_output.mkdir(exist_ok=True)
    for slug, entries in game_splits.items():
        with (games_output / f"{slug}.jsonl").open("w", encoding="utf-8") as handle:
            for entry in entries:
                handle.write(json.dumps(entry, ensure_ascii=False, sort_keys=True) + "\n")
    (games_output / "manifest.json").write_text(
        json.dumps(game_manifest, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    final_report = {**dict(report), "games": {item["slug"]: item["count"] for item in game_manifest}}
    (output / "report.json").write_text(
        json.dumps(final_report, ensure_ascii=False, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )


def _default_sources(base: Path) -> list[tuple[str, Mapping[str, Any]]]:
    manifest = base / "sources.json"
    if manifest.is_file():
        return load_manifest(manifest)
    candidates: list[tuple[str, Mapping[str, Any]]] = []
    for pattern in ("*.json", "*.jsonl", "*.ndjson", "*.csv"):
        candidates.extend((str(path), {}) for path in sorted((base / "sources").glob(pattern)))
    return candidates


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a reviewed Arabic question bank for Tahaddi")
    parser.add_argument("--source", action="append", default=[], help="JSON, JSONL, CSV path or URL; repeatable")
    parser.add_argument("--sources-file", type=Path, help="JSON manifest containing source metadata")
    parser.add_argument("--limit", type=int, default=50_000, help="Maximum source rows to process")
    parser.add_argument("--output", type=Path, default=Path("question_bank"), help="Output directory")
    parser.add_argument(
        "--allow-private-network",
        action="store_true",
        help="Allow localhost/private-network source URLs (disabled by default)",
    )
    parser.add_argument(
        "--allow-partial",
        action="store_true",
        help="Exit successfully when some sources fail and a partial bank is written",
    )
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    if args.limit < 1:
        print("--limit must be greater than zero", file=sys.stderr)
        return 2
    sources = [(source, {}) for source in args.source]
    if args.sources_file:
        sources.extend(load_manifest(args.sources_file.resolve()))
    if not sources:
        sources = _default_sources(Path.cwd())
    if not sources:
        print("No sources found. Use --source, --sources-file, or create sources.json.", file=sys.stderr)
        return 2

    loaded: list[QuestionRecord] = []
    source_errors: list[dict[str, str]] = []
    for location, metadata in sources:
        try:
            remaining = args.limit - len(loaded)
            if remaining <= 0:
                break
            loaded.extend(load_source(location, metadata, args.allow_private_network)[:remaining])
        except (OSError, ValueError, json.JSONDecodeError) as error:
            safe_location = _redact_location(location)
            safe_error = str(error).replace(location, safe_location)
            source_errors.append({"source": safe_location, "error": safe_error})

    unique, duplicate_count = dedupe_records(loaded)
    ready, review = build_questions(unique)
    report = {
        "loaded": len(loaded),
        "unique": len(unique),
        "duplicates_removed": duplicate_count,
        "ready": len(ready),
        "review": len(review),
        "source_errors": source_errors,
    }
    write_outputs(args.output.resolve(), ready, review, report)
    print(json.dumps(report, ensure_ascii=False))
    return 1 if source_errors and not args.allow_partial else 0


if __name__ == "__main__":
    raise SystemExit(main())
