"""
Image examination report for one file, in the order of the SWGDE image-authentication workflow:
provenance and acquisition → file structure → global analysis → local analysis → AI content → findings →
comparisons with copies → notes → examiner conclusion → technical review → method and limitations.

Used by the command-line examiner (scripts/examine.py) and by examinations in the web app.
"""

import io

from PIL import Image as PILImage
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Image, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table

from app.reports.pdf import BAD, INK, MONO, NA, OK, SMALL, _table, styles

SEVERITY_COLOR = {"high": BAD, "medium": NA, "low": NA, "info": INK}


def _img(data: bytes | None, width_mm: float) -> Image | Paragraph:
    if not data:
        return Paragraph("—", SMALL)
    img = PILImage.open(io.BytesIO(data)).convert("RGB")
    img.thumbnail((900, 900))
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=85)
    buf.seek(0)
    return Image(buf, width=width_mm * mm, height=width_mm * mm * img.height / img.width)


def _ts(ts: str | None) -> str:
    """2026-10-30T12:29:43.114174Z -> 2026-10-30 12:29:43 UTC"""
    return f"{ts[:19].replace('T', ' ')} UTC" if ts else "—"


def _p(text: str, style=SMALL) -> Paragraph:
    return Paragraph(str(text).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"), style)


def build_examination(subject: dict, report: dict, images: dict, method: dict, examination: dict | None = None) -> bytes:
    """
    subject: filename, sha256, size, mime, source, acquired_at, and optionally sha256_after (re-hash after analysis),
             provenance (text) and custody_anchor (the trusted timestamp that covers the custody log).
    report: the output of run_all() with images removed (split_images).
    images: {"original": bytes, "ela": PNG bytes, "copymove": JPEG or PNG bytes}; any can be missing.
    method: tool, commit, versions, examined_at, examiner.
    examination: {"question", "notes": [...], "conclusion": {...}, "review": {...}} from the web app, or None.
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=15 * mm, bottomMargin=15 * mm,
                            title=f"Image examination — {subject['filename']}", author="ChainProof")
    exam = examination or {}
    checks = report["checks"]
    h2, body = styles["Heading2"], styles["BodyText"]
    story = [
        Paragraph("Image Examination Report", styles["Title"]),
        _table([
            ["Item", _p(subject["filename"]), "Examined", _p(_ts(method["examined_at"]))],
            ["Question", _p(exam.get("question") or "Is this image an unaltered record of what the camera captured?"), "Examiner",
             _p(method.get("examiner") or "not recorded")],
        ], [22 * mm, 88 * mm, 22 * mm, 48 * mm], header=False),
        Spacer(1, 3 * mm),
    ]

    # 1. Provenance and acquisition
    after = subject.get("sha256_after")
    integrity = ("unchanged by the examination" if after == subject["sha256"] else "CHANGED during examination") if after else "not re-checked"
    story += [Paragraph("1. Provenance and acquisition", h2), _table([
        ["Source", _p(subject.get("source") or "not recorded")],
        ["Provenance", _p(subject.get("provenance") or "Unknown origin. No capture signature; treat as an unverified copy.")],
        ["SHA-256 at intake", _p(subject["sha256"], MONO)],
        ["SHA-256 after analysis", _p(f"{after or '—'} ({integrity})", MONO)],
        ["Size / type", f"{subject['size']:,} bytes · {subject['mime']}"],
        ["Received", _p(subject.get("acquired_at") or "not recorded")],
        ["Custody log anchor", _p(subject.get("custody_anchor") or "not recorded")],
    ], [38 * mm, 142 * mm], header=False), Spacer(1, 3 * mm)]

    # 2. File structure
    meta, c2pa = checks["metadata"], checks["c2pa"]
    tags = ", ".join(f"{k}: {v}" for k, v in meta.get("tags", {}).items()) or "none"
    st = checks.get("structure") or {}
    history_rows = [["History", _p(f"{st['label']}. {st['detail']}")]] if st.get("label") else []
    if st.get("quality") is not None:
        history_rows.append(["Compression", _p(f"about quality {st['quality']} · {'standard' if st.get('standard_table') else 'custom'} table · "
                                               f"{'progressive' if st.get('progressive') else 'baseline'} · blocks: {' → '.join(st.get('blocks') or [])}")])
    story += [Paragraph("2. File structure", h2), _table(history_rows + [
        ["Format", f"{meta.get('format')} · {meta.get('width')} × {meta.get('height')} px"],
        ["EXIF", _p(tags)],
        ["GPS", _p(f"{meta['gps']['lat']}, {meta['gps']['lon']}" if meta.get("gps") else "none")],
        ["Content Credentials (C2PA)", _p(f"present · {c2pa.get('generator') or 'unknown tool'} · signed by {c2pa.get('issuer') or 'unknown'} · "
                                          f"validation: {c2pa.get('validation_state') or 'n/a'}" if c2pa.get("present") else "none")],
    ], [38 * mm, 142 * mm], header=False), Spacer(1, 3 * mm)]

    # 3–4. Global and local analysis, side by side with the image
    ela, cm = checks["ela"], checks["copy_move"]
    regions = "; ".join(f"{r['matches']} points, copy at {r['copy_box']}" for r in cm.get("regions", [])) or "no cloned area found"
    story += [KeepTogether([
        Paragraph("3. Global analysis (error levels) and 4. Local analysis (cloned areas)", h2),
        Table([[_img(images.get("original"), 56), _img(images.get("ela"), 56), _img(images.get("copymove"), 56)],
               [_p("Image as received"), _p(f"ELA heatmap · mean error {ela.get('mean_error')}, outliers {ela.get('outlier_ratio', 0):.2%}"),
                _p(f"Clone overlay · {regions}")]],
              colWidths=[60 * mm] * 3, style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]),
        Spacer(1, 3 * mm),
    ])]

    # 5. AI-generated content
    ai_note = ("Content Credentials from a signer on the C2PA trust list declare AI generation." if c2pa.get("ai_generated") and c2pa.get("trusted")
               else "Content Credentials claim AI generation, but the signer is not on the C2PA trust list, so the claim could be forged."
               if c2pa.get("ai_generated") else "No AI declaration found. Absence is not evidence of a real photo: credentials are easily stripped, "
                    "and learned AI detectors were not used because none passed validation.")
    story += [Paragraph("5. AI-generated content", h2), _p(ai_note, body), Spacer(1, 3 * mm)]

    # 6. Findings with validated error rates
    rows = [["Severity", "Check", "Finding", "How reliable is this check?"]]
    for f in report["findings"]:
        color = SEVERITY_COLOR.get(f["severity"], INK).hexval()
        rows.append([Paragraph(f'<font color="{color}"><b>{f["severity"].upper()}</b></font>', SMALL), _p(f["check"]),
                     _p(f"{f['title']}. {f['detail']}" + (f" What else explains it: {f['alternative']}" if f.get("alternative") else "")),
                     _p(f.get("validation") or "Not validated")])
    story += [Paragraph("6. Findings", h2), _table(rows, [18 * mm, 20 * mm, 88 * mm, 54 * mm]),
              _p(f"Automated summary: {report['label']} (score {report['score']}). {report['disclaimer']}"), Spacer(1, 3 * mm)]

    # 7. Comparisons with questioned copies (difference maps made against this item's original)
    comparisons = exam.get("comparisons") or []
    story.append(Paragraph("7. Comparisons with copies", h2))
    if not comparisons:
        story += [_p("No questioned copies were compared with this item.", body), Spacer(1, 3 * mm)]
    else:
        story.append(_p("Each questioned copy was lined up with this item's original; areas that differ beyond recompression and "
                        "resizing are tinted and outlined in red.", body))
        for c in comparisons[-4:]:
            outcome = (f"{c['regions']} changed region(s), {c['changed_ratio']:.1%} of the image" if c["regions"]
                       else "no change beyond recompression and resizing")
            picture = (_img(c["overlay_png"], 70) if c.get("overlay_png")
                       else _p("Difference map not stored: this comparison was made before maps were kept. The result is in the custody log."))
            story.append(KeepTogether([Table([[picture, _table([
                ["Copy", _p(c["filename"])],
                ["SHA-256", _p(c["sha256"], MONO)],
                ["Result", Paragraph(f'<font color="{(BAD if c["regions"] else OK).hexval()}"><b>{outcome}</b></font>', SMALL)],
                ["Match", _p(f"fingerprint {c['distance']}/64 bits apart · {c.get('aligned') or 'aligned'}")],
                ["By", _p(f"{c['by']} · {_ts(c['ts'])} (custody entry #{c['seq']})")],
                ["Exhibit", _p("copy kept with this item, re-hashed whenever it is downloaded" if c.get("kept")
                               else "only the hash was kept (compared before copies were stored)")],
            ], [22 * mm, 82 * mm], header=False)]], colWidths=[74 * mm, 106 * mm],
                style=[("VALIGN", (0, 0), (-1, -1), "TOP"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]), Spacer(1, 3 * mm)]))
        if len(comparisons) > 4:
            story.append(_p(f"{len(comparisons) - 4} earlier comparison(s) are in the custody log.", body))

    # 8. Notes, 9. conclusion, 10. review
    notes = exam.get("notes") or []
    story.append(Paragraph("8. Examiner notes", h2))
    if notes:
        story += [_table([["Time (UTC)", "By", "Note"]] + [[_p(_ts(n["ts"])), _p(n["by"]), _p(n["text"])] for n in notes],
                         [32 * mm, 30 * mm, 118 * mm]), Spacer(1, 3 * mm)]
    else:
        story += [_p("No notes recorded.", body), Spacer(1, 3 * mm)]
    c = exam.get("conclusion")
    story.append(Paragraph("9. Examiner conclusion", h2))
    if c:
        story += [_table([
            ["Hypotheses", _p(f"H1: {c['h1']}  ·  H2: {c['h2']}")],
            ["Conclusion", Paragraph("<b>The findings do not help decide between H1 and H2.</b>" if c.get("level_key") == "none"
                                     else f"<b>The findings provide {c['level']} for H1 rather than H2.</b>", SMALL)],
            ["Reasoning", _p(c["rationale"])],
            ["Limitations", _p(c["limitations"])],
            ["By", _p(f"{c['by']} · {_ts(c['ts'])}")],
        ], [38 * mm, 142 * mm], header=False)]
    else:
        story.append(_p("No examiner conclusion recorded. The findings above are automated indicators only and are not an opinion.", body))
    story.append(Spacer(1, 3 * mm))

    r = exam.get("review")
    story.append(Paragraph("10. Technical review", h2))
    if r:
        color = (OK if r["agrees"] else BAD).hexval()
        story.append(_table([
            ["Reviewer", _p(f"{r['by']} · {_ts(r['ts'])}")],
            ["Outcome", Paragraph(f'<font color="{color}"><b>{"Agrees with the conclusion" if r["agrees"] else "Does not agree"}</b></font>', SMALL)],
            ["Comment", _p(r["comment"])],
        ], [38 * mm, 142 * mm], header=False))
    else:
        story.append(_p("Not reviewed. A second examiner should check method and wording before this report is relied on.", body))

    # 10. Method and limitations
    validation = report.get("validation")
    story += [Spacer(1, 3 * mm), Paragraph("11. Method and limitations", h2), _table([
        ["Tool", _p(f"{method['tool']} · commit {method.get('commit', 'unknown')}")],
        ["Libraries", _p(method.get("versions", ""))],
        ["Validation", _p(f"Error rates measured {_ts(validation['validated_at'])} on test set {validation['test_set']} (commit {validation['commit']}). "
                          "See docs/validation/VALIDATION.md." if validation else "These checks have not been validated; treat all findings as unquantified.")],
        ["Limitations", _p("Automated checks give indicators, not proof. A clean result does not show an image is authentic. "
                           "Recompression, resizing and messaging apps weaken or erase traces. Identical real objects can look like clones. "
                           "Analysis runs on a copy capped at 2048 px; the original was not modified.")],
    ], [38 * mm, 142 * mm], header=False)]

    def footer(canvas, doc_):
        canvas.saveState()
        canvas.setFont("Helvetica", 7)
        canvas.setFillColor(INK)
        canvas.drawString(15 * mm, 8 * mm, f"ChainProof image examination · {subject['sha256'][:16]}… · {_ts(method['examined_at'])}")
        canvas.drawRightString(A4[0] - 15 * mm, 8 * mm, f"Page {doc_.page}")
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    return buf.getvalue()
