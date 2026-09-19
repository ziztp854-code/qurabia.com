import csv
import json
import subprocess
import sys
from dataclasses import replace
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import build_arabic_question_bank as builder  # noqa: E402


def capital_records():
    return [
        builder.QuestionRecord(
            prompt="ما عاصمة المملكة العربية السعودية؟",
            answer="الرياض",
            category="جغرافيا",
            difficulty="EASY",
            source="المصدر الأول",
            license="CC BY 4.0",
        ),
        builder.QuestionRecord(
            prompt="ما عاصمة مصر؟",
            answer="القاهرة",
            category="جغرافيا",
            difficulty="EASY",
            source="المصدر الثاني",
            license="CC BY 4.0",
        ),
        builder.QuestionRecord(
            prompt="ما عاصمة الأردن؟",
            answer="عمّان",
            category="جغرافيا",
            difficulty="EASY",
            source="المصدر الثالث",
            license="CC BY 4.0",
        ),
        builder.QuestionRecord(
            prompt="ما عاصمة المغرب؟",
            answer="الرباط",
            category="جغرافيا",
            difficulty="EASY",
            source="المصدر الرابع",
            license="CC BY 4.0",
        ),
    ]


def test_normalize_arabic_removes_diacritics_and_unifies_alef():
    assert builder.normalize_arabic("  إِنَّ  الأُرْدُنّ  ") == "ان الاردن"
    assert builder.normalize_arabic("مؤلف ١٢۳") == "مولف 123"
    assert builder.normalize_arabic("مدرسة") != builder.normalize_arabic("مدرسه")


def test_dedupe_keeps_one_normalized_prompt_and_answer():
    first = builder.QuestionRecord(prompt="ما عاصمة مصر؟", answer="القاهرة")
    duplicate = builder.QuestionRecord(prompt="ما عاصمةُ مصر ؟", answer="القاهرة")

    unique, removed = builder.dedupe_records([first, duplicate])

    assert unique == [first]
    assert removed == 1


def test_build_questions_uses_same_family_answers_as_distractors():
    ready, review = builder.build_questions(capital_records())

    assert len(ready) == 4
    assert review == []
    answers = {builder.normalize_arabic(record.answer) for record in capital_records()}
    for question in ready:
        assert len(question.options) == 4
        assert len({builder.normalize_arabic(option) for option in question.options}) == 4
        assert sum(
            builder.normalize_arabic(option) == builder.normalize_arabic(question.answer)
            for option in question.options
        ) == 1
        assert {builder.normalize_arabic(option) for option in question.options} <= answers
        assert question.correct_option == question.options.index(question.answer)


def test_existing_trusted_options_are_validated_and_kept():
    record = builder.QuestionRecord(
        prompt="ما الكوكب الأقرب إلى الشمس؟",
        answer="عطارد",
        options=("عطارد", "الزهرة", "الأرض", "المريخ"),
        category="علوم",
    )

    ready, review = builder.build_questions([record])

    assert len(ready) == 1
    assert review == []
    assert set(ready[0].options) == set(record.options)


def test_question_without_three_trusted_distractors_goes_to_review():
    record = builder.QuestionRecord(prompt="من مؤلف كتاب فريد؟", answer="كاتب واحد")

    ready, review = builder.build_questions([record])

    assert ready == []
    assert review[0].review_reason == "insufficient_trusted_distractors"


def test_sql_export_is_draft_idempotent_and_escapes_text():
    record = builder.QuestionRecord(
        prompt="ما اسم مدينة تُعرف بلقب 'العروس'؟",
        answer="جدة",
        options=("جدة", "الرياض", "الدمام", "أبها"),
        category="جغرافيا",
        source="مرجع موثوق",
        license="CC BY 4.0",
    )
    ready, _ = builder.build_questions([record])

    sql = builder.render_sql(ready)

    assert ":'owner_id'" in sql
    assert "'DRAFT'::\"QuestionStatus\"" in sql
    assert "ON CONFLICT DO NOTHING" in sql
    assert "''العروس''" in sql
    assert 'INSERT INTO "QuestionOption"' in sql
    assert "CC BY 4.0" in sql
    assert '"ownerId" = current_setting(\'tahaddi.import_owner_id\')' in sql
    assert '"status" = \'DRAFT\'::"QuestionStatus"' in sql
    assert "md5(current_setting('tahaddi.import_owner_id')" in sql
    assert 'DELETE FROM "QuestionOption"' in sql


def test_cli_writes_jsonl_csv_sql_and_report(tmp_path):
    source = tmp_path / "source.jsonl"
    with source.open("w", encoding="utf-8") as handle:
        for record in capital_records():
            handle.write(json.dumps(record.to_dict(), ensure_ascii=False) + "\n")

    output = tmp_path / "question_bank"
    result = subprocess.run(
        [
            sys.executable,
            str(ROOT / "build_arabic_question_bank.py"),
            "--source",
            str(source),
            "--limit",
            "50",
            "--output",
            str(output),
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert (output / "questions_ready.jsonl").is_file()
    assert (output / "questions_review.jsonl").is_file()
    assert (output / "questions_ready.csv").is_file()
    assert (output / "questions_review.csv").is_file()
    assert (output / "import_questions.sql").is_file()
    assert (output / "games" / "manifest.json").is_file()
    assert (output / "games" / "letter-challenge.jsonl").is_file()
    report = json.loads((output / "report.json").read_text(encoding="utf-8"))
    assert report["loaded"] == 4
    assert report["ready"] == 4
    assert report["review"] == 0
    with (output / "questions_ready.csv").open(encoding="utf-8-sig", newline="") as handle:
        assert len(list(csv.DictReader(handle))) == 4


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("EASY", "EASY"),
        ("سهل", "EASY"),
        ("متوسط", "MEDIUM"),
        ("صعب", "HARD"),
        ("غير معروف", "MEDIUM"),
    ],
)
def test_difficulty_mapping(value, expected):
    assert builder.normalize_difficulty(value) == expected


def test_classification_family_and_answer_kinds():
    assert builder.infer_category("ما عاصمة اليابان؟") == "جغرافيا"
    assert builder.infer_category("سؤال بلا تصنيف معروف") == "عام"
    assert builder.question_family("من مؤلف هذا الكتاب؟") == "author"
    assert builder.question_family("سؤال بلا عائلة") == ""
    assert builder.answer_kind("1999") == "year"
    assert builder.answer_kind("42") == "number"
    assert builder.answer_kind("محمد بن سعود") == "phrase"
    assert builder.answer_kind("الرياض") == "word"


@pytest.mark.parametrize(
    ("record", "reason"),
    [
        (builder.QuestionRecord(prompt="قصير", answer="جواب"), "invalid_prompt_length"),
        (builder.QuestionRecord(prompt="سؤال صالح وطويل؟", answer=""), "invalid_answer_length"),
        (
            builder.QuestionRecord(prompt="سؤال صالح وطويل؟", answer="جواب", category="ف" * 121),
            "invalid_category_length",
        ),
        (
            builder.QuestionRecord(
                prompt="سؤال صالح وطويل؟",
                answer="جواب",
                options=("جواب", "أ" * 501, "ج", "د"),
            ),
            "invalid_option_length",
        ),
        (
            builder.QuestionRecord(prompt="سؤال صالح وطويل؟", answer="جواب", explanation="ش" * 2001),
            "invalid_explanation_length",
        ),
        (
            builder.QuestionRecord(prompt="سؤال صالح وطويل؟", answer="جواب", source="م" * 501),
            "invalid_source_length",
        ),
        (
            builder.QuestionRecord(prompt="سؤال صالح وطويل؟", answer="جواب", time_limit=4),
            "invalid_time_limit",
        ),
        (
            builder.QuestionRecord(prompt="سؤال صالح وطويل؟", answer="جواب", base_points=99),
            "invalid_base_points",
        ),
    ],
)
def test_invalid_records_are_sent_to_review(record, reason):
    ready, review = builder.build_questions([record])
    assert ready == []
    assert review[0].review_reason == reason


def test_conflicting_answers_are_sent_to_review():
    records = [
        builder.QuestionRecord(prompt="ما عاصمة دولة الاختبار؟", answer="مدينة أولى"),
        builder.QuestionRecord(prompt="ما عاصمة دولة الاختبار؟", answer="مدينة ثانية"),
    ]
    ready, review = builder.build_questions(records)
    assert ready == []
    assert {record.review_reason for record in review} == {"conflicting_correct_answers"}


def test_record_mapping_supports_aliases_and_correct_index():
    record = builder.record_from_mapping(
        {
            "question": "ما عاصمة مصر؟",
            "choices": '["الرياض", "القاهرة", "عمّان", "الرباط"]',
            "correctOption": 1,
            "timeLimit": "30",
            "basePoints": "1500",
            "licence": "CC0",
        },
        {"name": "مرجع", "category": "جغرافيا", "difficulty": "سهل"},
    )
    assert record.answer == "القاهرة"
    assert record.options[1] == "القاهرة"
    assert record.source == "مرجع"
    assert record.license == "CC0"
    assert record.time_limit == 30
    assert record.base_points == 1500
    one_based = builder.record_from_mapping(
        {"prompt": "ما عاصمة مصر؟", "options": "الرياض|القاهرة|عمّان|الرباط", "correct_option": 2},
        {"correct_index_base": 1},
    )
    assert one_based.answer == "القاهرة"


def test_record_mapping_handles_bad_index_and_delimited_options():
    record = builder.record_from_mapping(
        {"text": "سؤال صالح بلا جواب؟", "options": "أ|ب|ج|د", "correct_option": "bad"}
    )
    assert record.answer == ""
    assert record.options == ("أ", "ب", "ج", "د")
    fallback = builder.record_from_mapping(
        {"prompt": "سؤال صالح آخر؟", "answer": "أ", "time_limit": "bad", "base_points": None}
    )
    assert fallback.time_limit == 20
    assert fallback.base_points == 1000


def test_load_source_supports_json_csv_and_jsonl(tmp_path):
    json_path = tmp_path / "questions.json"
    json_path.write_text(
        json.dumps({"questions": [{"prompt": "ما عاصمة مصر؟", "answer": "القاهرة"}]}, ensure_ascii=False),
        encoding="utf-8",
    )
    csv_path = tmp_path / "questions.csv"
    csv_path.write_text("prompt,answer\nما عاصمة الأردن؟,عمّان\n", encoding="utf-8-sig")
    jsonl_path = tmp_path / "questions.jsonl"
    jsonl_path.write_text(
        json.dumps({"prompt": "ما عاصمة المغرب؟", "answer": "الرباط"}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    assert builder.load_source(str(json_path))[0].answer == "القاهرة"
    assert builder.load_source(str(csv_path))[0].answer == "عمّان"
    assert builder.load_source(str(jsonl_path))[0].answer == "الرباط"


def test_source_parsers_reject_invalid_shapes():
    with pytest.raises(ValueError, match="JSONL line"):
        list(builder._iter_rows("[]\n", "jsonl"))
    with pytest.raises(ValueError, match="JSON source"):
        list(builder._iter_rows('{"unexpected": true}', "json"))


def test_manifest_resolves_paths_and_keeps_urls(tmp_path):
    manifest = tmp_path / "sources.json"
    manifest.write_text(
        json.dumps(
            {
                "sources": [
                    "relative.jsonl",
                    {"path": "data/questions.csv", "license": "CC0"},
                    {"url": "https://example.test/questions.json", "format": "json"},
                    {"name": "ignored without location"},
                ]
            }
        ),
        encoding="utf-8",
    )
    sources = builder.load_manifest(manifest)
    assert sources[0] == ("relative.jsonl", {})
    assert Path(sources[1][0]).is_absolute()
    assert sources[2][0].startswith("https://")
    bad_manifest = tmp_path / "bad.json"
    bad_manifest.write_text('{"sources": "not-a-list"}', encoding="utf-8")
    with pytest.raises(ValueError, match="list"):
        builder.load_manifest(bad_manifest)


def test_remote_reader_uses_utf8_and_user_agent(monkeypatch):
    class Headers:
        @staticmethod
        def get_content_charset():
            return None

    class Response:
        headers = Headers()

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        @staticmethod
        def read():
            return "مرحبا".encode()

    captured = {}

    def fake_urlopen(request, timeout):
        captured["agent"] = request.headers["User-agent"]
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(
        builder.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(builder.socket.AF_INET, builder.socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))],
    )
    monkeypatch.setattr(builder.urllib.request, "urlopen", fake_urlopen)
    assert builder._read_source_text("https://example.test/questions.json") == "مرحبا"
    assert captured == {"agent": "TahaddiQuestionBankBuilder/1.0", "timeout": 45}


def test_remote_reader_blocks_private_hosts_and_redacts_tokens(monkeypatch):
    monkeypatch.setattr(
        builder.socket,
        "getaddrinfo",
        lambda *_args, **_kwargs: [(builder.socket.AF_INET, builder.socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))],
    )
    with pytest.raises(ValueError, match="private network"):
        builder._read_source_text("http://internal.test/questions.json?token=secret")
    assert (
        builder._redact_location("https://user:pass@example.test/questions.json?token=secret#fragment")
        == "https://example.test/questions.json"
    )
    with pytest.raises(ValueError, match="credentials"):
        builder._validate_remote_url("https://user:pass@example.test/questions.json")


def test_default_sources_and_cli_errors(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    assert builder.main(["--limit", "0"]) == 2
    assert builder.main([]) == 2

    sources_dir = tmp_path / "sources"
    sources_dir.mkdir()
    (sources_dir / "broken.json").write_text("not-json", encoding="utf-8")
    output = tmp_path / "output"
    assert builder.main(["--output", str(output)]) == 1
    report = json.loads((output / "report.json").read_text(encoding="utf-8"))
    assert report["source_errors"]

    good = tmp_path / "good.jsonl"
    good.write_text(
        "".join(json.dumps(record.to_dict(), ensure_ascii=False) + "\n" for record in capital_records()),
        encoding="utf-8",
    )
    partial = tmp_path / "partial"
    assert (
        builder.main(
            ["--source", str(good), "--source", str(sources_dir / "broken.json"), "--output", str(partial)]
        )
        == 1
    )
    allowed = tmp_path / "allowed"
    assert (
        builder.main(
            [
                "--source",
                str(good),
                "--source",
                str(sources_dir / "broken.json"),
                "--allow-partial",
                "--output",
                str(allowed),
            ]
        )
        == 0
    )


def test_sources_manifest_is_used_by_main(tmp_path):
    data = tmp_path / "data.jsonl"
    data.write_text(
        "".join(json.dumps(record.to_dict(), ensure_ascii=False) + "\n" for record in capital_records()),
        encoding="utf-8",
    )
    manifest = tmp_path / "sources.json"
    manifest.write_text(
        json.dumps({"sources": [{"path": "data.jsonl", "license": "CC BY 4.0"}]}),
        encoding="utf-8",
    )
    output = tmp_path / "built"
    assert builder.main(["--sources-file", str(manifest), "--limit", "4", "--output", str(output)]) == 0
    report = json.loads((output / "report.json").read_text(encoding="utf-8"))
    assert report["ready"] == 4


def test_stable_ids_change_with_option_position_only_for_options():
    record = replace(capital_records()[0], source="مرجع")
    assert builder.stable_id("qbq", record) == builder.stable_id("qbq", record)
    assert builder.stable_id("qbo", record, "0") != builder.stable_id("qbo", record, "1")


def test_ready_questions_are_split_for_every_game_profile():
    ready, review = builder.build_questions(capital_records())
    assert review == []
    splits, manifest = builder.build_game_splits(ready)

    assert set(splits) == {profile[0] for profile in builder.GAME_PROFILES}
    assert len(splits["parallel-world"]) == 4
    assert len(splits["reverse-time"]) == 4
    assert len(splits["category-board"]) == 4
    assert len(splits["millionaire"]) == 4
    assert len(splits["word-code"]) == 4
    assert len(splits["letter-challenge"]) == 4
    assert len(splits["infiltrator"]) == 2
    assert splits["chess"] == []
    assert splits["baloot"] == []
    assert splits["memory-flash"] == []
    assert splits["color-rush"] == []
    millionaire = splits["millionaire"][0]
    assert 1 <= millionaire["level"] <= 5
    assert millionaire["value"] in builder.MILLIONAIRE_VALUES[:5]
    assert millionaire["answerIndex"] == millionaire["correctOption"]
    assert {item["slug"] for item in manifest} == set(splits)
    assert next(item for item in manifest if item["slug"] == "chess")["status"] == "not_applicable"
