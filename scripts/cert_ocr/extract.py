#!/usr/bin/env python3
"""
cert_extractor_easyocr.py
=========================
SELF-CONTAINED certificate extractor using **EasyOCR** (pip-installable, no
external .exe binary — security-friendly).

Everything is in this one file: OpenCV preprocessing, EasyOCR text recognition,
field extraction (cert code / member / dates / cert number), catalog + roster
matching, and JSON output. Just drop it next to your images and run.

Install (pip only, no binary):
    pip install easyocr opencv-python-headless numpy

First run downloads EasyOCR model weights (~64MB). If your network blocks that,
see the OFFLINE note in easyocr_engine.py (env vars EASYOCR_MODEL_DIR /
EASYOCR_DOWNLOAD are honored here too).

CLI:
    python cert_extractor_easyocr.py "C:\\path\\cert.png" --roster roster.json --out results.json
    python cert_extractor_easyocr.py cert_jp.png --lang eng+jpn        # Japanese
    python cert_extractor_easyocr.py a.png b.png c.png --out batch.json # batch/list
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime
from difflib import SequenceMatcher
from typing import Any, Optional

import cv2
import numpy as np

logger = logging.getLogger("cert_extractor_easyocr")

DEFAULT_CATALOG: list[dict[str, Any]] = [
    {"code": "AZ-104", "name": "Microsoft Azure Administrator Associate",
     "provider": "Microsoft", "aliases": ["azure administrator", "az 104", "az104"]},
    {"code": "AZ-204", "name": "Microsoft Azure Developer Associate",
     "provider": "Microsoft", "aliases": ["azure developer", "az 204", "az204"]},
    {"code": "AZ-305", "name": "Microsoft Azure Solutions Architect Expert",
     "provider": "Microsoft", "aliases": ["solutions architect", "az 305", "az305"]},
    {"code": "AZ-400", "name": "Microsoft DevOps Engineer Expert",
     "provider": "Microsoft", "aliases": ["devops engineer", "az 400", "az400"]},
    {"code": "AWS-SAA", "name": "AWS Certified Solutions Architect - Associate",
     "provider": "AWS", "aliases": ["solutions architect associate", "saa-c03",
                                    "aws saa", "certified solutions architect"]},
    {"code": "MC-AGENTIC-AI", "name": "Microsoft Certified: Agentic AI Business Solutions Architect",
     "provider": "Microsoft", "aliases": ["agentic ai business solutions architect",
                                          "agentic ai", "agentic ai business solutions"]},
]


@dataclass
class Field:
    value: Optional[str] = None
    confidence: float = 0.0
    raw: Optional[str] = None


@dataclass
class ExtractionResult:
    source_file: str
    ok: bool = True
    error: Optional[str] = None
    certification_code: Field = field(default_factory=Field)
    certification_name: Field = field(default_factory=Field)
    provider: Field = field(default_factory=Field)
    member_name: Field = field(default_factory=Field)
    member_email: Field = field(default_factory=Field)
    issue_date: Field = field(default_factory=Field)
    expiration_date: Field = field(default_factory=Field)
    certificate_number: Field = field(default_factory=Field)
    ocr_confidence: float = 0.0
    overall_confidence: float = 0.0
    needs_review: bool = True
    warnings: list[str] = field(default_factory=list)
    ocr_text: str = ""

    def to_update_payload(self) -> dict[str, Any]:
        return {
            "match": {
                "certificationCode": self.certification_code.value,
                "certificationName": self.certification_name.value,
                "provider": self.provider.value,
                "memberName": self.member_name.value,
                "memberEmail": self.member_email.value,
            },
            "certificate": {
                "certificateNumber": self.certificate_number.value,
                "issuedDate": self.issue_date.value,
                "expirationDate": self.expiration_date.value,
            },
            "suggested": {
                "status": "CERTIFIED" if self.certification_code.value else "PLANNED",
                "progressPercent": 100 if self.certification_code.value else 0,
                "verificationStatus": "PENDING",
            },
            "confidence": {
                "ocr": round(self.ocr_confidence, 3),
                "overall": round(self.overall_confidence, 3),
                "needsReview": self.needs_review,
            },
            "fields": {
                "certificationCode": round(self.certification_code.confidence, 3),
                "certificationName": round(self.certification_name.confidence, 3),
                "provider": round(self.provider.confidence, 3),
                "memberName": round(self.member_name.confidence, 3),
                "memberEmail": round(self.member_email.confidence, 3),
                "issueDate": round(self.issue_date.confidence, 3),
                "expirationDate": round(self.expiration_date.confidence, 3),
                "certificateNumber": round(self.certificate_number.confidence, 3),
            },
            "warnings": self.warnings,
        }


def _imread_unicode(image_path: str) -> Optional[np.ndarray]:
    try:
        buf = np.fromfile(image_path, dtype=np.uint8)
        if buf.size == 0:
            return None
        return cv2.imdecode(buf, cv2.IMREAD_COLOR)
    except Exception:
        return cv2.imread(image_path, cv2.IMREAD_COLOR)


def _imwrite_unicode(path: str, img: np.ndarray) -> bool:
    try:
        ext = os.path.splitext(path)[1] or ".png"
        ok, buf = cv2.imencode(ext, img)
        if not ok:
            return False
        buf.tofile(path)
        return True
    except Exception:
        return cv2.imwrite(path, img)


def _deskew(gray: np.ndarray) -> np.ndarray:
    inv = cv2.bitwise_not(gray)
    coords = np.column_stack(np.where(inv > 0))
    if coords.shape[0] < 50:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = 90 + angle
    if abs(angle) < 0.5 or abs(angle) > 45:
        return gray
    (h, w) = gray.shape[:2]
    m = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(gray, m, (w, h), flags=cv2.INTER_CUBIC,
                          borderMode=cv2.BORDER_REPLICATE)


def preprocess(image_path: str, debug_path: Optional[str] = None) -> np.ndarray:
    if not os.path.exists(image_path):
        raise FileNotFoundError(image_path)
    img = _imread_unicode(image_path)
    if img is None:
        raise ValueError(f"Could not decode image: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape[:2]
    long_side = max(h, w)
    if long_side < 1500:
        scale = 1500.0 / long_side
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    gray = cv2.fastNlMeansDenoising(gray, h=10)
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    gray = _deskew(gray)
    if debug_path:
        _imwrite_unicode(debug_path, gray)
    # NOTE: EasyOCR works best on grayscale (not hard-binarized) input, so we
    # return the cleaned grayscale image rather than an adaptive-threshold one.
    return gray


_READER_CACHE: dict[str, object] = {}


def _map_lang(lang: str) -> list[str]:
    parts = [p.strip().lower() for p in lang.replace("+", " ").split()]
    mapping = {"eng": "en", "en": "en", "jpn": "ja", "ja": "ja",
               "vie": "vi", "vi": "vi"}
    codes: list[str] = []
    for p in parts:
        code = mapping.get(p)
        if code and code not in codes:
            codes.append(code)
    if not codes:
        codes = ["en"]
    if "ja" in codes and "en" not in codes:
        codes.append("en")
    return codes


def _get_reader(lang: str):
    key = lang.lower()
    if key in _READER_CACHE:
        return _READER_CACHE[key]
    import easyocr  # lazy import
    codes = _map_lang(lang)
    model_dir = os.environ.get("EASYOCR_MODEL_DIR")
    download_enabled = os.environ.get("EASYOCR_DOWNLOAD", "1") != "0"
    kwargs = {"gpu": False, "verbose": False, "download_enabled": download_enabled}
    if model_dir:
        kwargs["model_storage_directory"] = model_dir
    logger.info("Loading EasyOCR reader for %s (first run downloads models)...", codes)
    reader = easyocr.Reader(codes, **kwargs)
    _READER_CACHE[key] = reader
    return reader


def run_ocr(gray: np.ndarray, lang: str = "eng") -> tuple[str, float]:
    """OCR with EasyOCR. Returns (text, mean_confidence[0..1])."""
    reader = _get_reader(lang)
    results = reader.readtext(gray, detail=1, paragraph=False)

    def _sort_key(item):
        bbox = item[0]
        ys = [pt[1] for pt in bbox]
        xs = [pt[0] for pt in bbox]
        return (round(min(ys) / 10), min(xs))

    results.sort(key=_sort_key)
    lines = [str(t) for (_b, t, _c) in results if str(t).strip()]
    confs = [float(c) for (_b, _t, c) in results]
    text = "\n".join(lines)
    mean_conf = (sum(confs) / len(confs)) if confs else 0.0
    return text, round(mean_conf, 3)


def _ratio(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _best_match(target: str, choices: list[str]) -> tuple[Optional[str], float]:
    best, best_score = None, 0.0
    for c in choices:
        s = _ratio(target, c)
        if s > best_score:
            best, best_score = c, s
    return best, best_score


_STOP = {"microsoft", "certified", "certificate", "certification", "the", "of",
         "and", "for", "associate", "expert", "fundamentals", "aws", "google"}


def _token_overlap(a: str, b: str) -> float:
    ta = {t for t in re.findall(r"[a-z0-9]+", a.lower()) if t not in _STOP and len(t) > 2}
    tb = {t for t in re.findall(r"[a-z0-9]+", b.lower()) if t not in _STOP and len(t) > 2}
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


_CODE_RE = re.compile(r"\b([A-Z]{2,4}[-\s]?\d{2,4}|AWS[-\s]?[A-Z]{2,4})\b")

_CERTNO_PRIMARY = re.compile(
    r"\bcert(?:ificate|ification)?\s*(?:no\.?|number|num|#)\s*[:#]?\s*"
    r"((?=[A-Z0-9-]*\d)[A-Z0-9]{2,}(?:[-][A-Z0-9]{2,}){0,5})", re.IGNORECASE)
_CERTNO_FALLBACK = re.compile(
    r"\b(?:credential|registration|verification)\s*(?:id|no\.?|number|#)?\s*[:#]?\s*"
    r"((?=[A-Z0-9-]*\d)[A-Z0-9]{2,}(?:[-][A-Z0-9]{2,}){0,5})", re.IGNORECASE)

_DATE_LABELS_ISSUE = ["earned on", "issued on", "issued", "issue date", "date of issue",
                      "awarded on", "awarded", "completion date", "date earned",
                      "completed on", "date completed", "achieved on"]
_DATE_LABELS_EXPIRE = ["expires on", "expires", "expiry", "expiration", "valid until",
                       "valid through", "renew by", "renewal date"]

_DATE_PATTERNS = [
    r"\d{4}[-/.]\d{1,2}[-/.]\d{1,2}",
    r"\d{1,2}[-/.]\d{1,2}[-/.]\d{4}",
    r"\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}",
    r"[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4}",
]
_DATE_RE = re.compile("|".join(f"(?:{p})" for p in _DATE_PATTERNS))

_NAME_TRIGGERS = re.compile(
    r"(?:certify that|awarded to|presented to|this certifies that|"
    r"has been awarded to|is hereby granted to|congratulations)\s*[:,]?\s*([A-Z][^\n]{2,60})",
    re.IGNORECASE)
_NAME_BEFORE = re.compile(
    r"([A-Z][A-Za-z.'\-]+(?:[ \t]+[A-Z][A-Za-z.'\-]+){1,4})[ \t]*\n[ \t]*"
    r"(?:has successfully|has been awarded|has completed|has earned|"
    r"has met|successfully (?:passed|completed|earned))", re.MULTILINE)


def _normalize_date(s: str) -> Optional[str]:
    s = s.strip().replace(".", " ").replace(",", " ")
    s = re.sub(r"\s+", " ", s)
    fmts = ["%Y-%m-%d", "%Y/%m/%d", "%d %m %Y", "%d/%m/%Y", "%m/%d/%Y",
            "%d %b %Y", "%d %B %Y", "%b %d %Y", "%B %d %Y"]
    for fmt in fmts:
        try:
            base = s.title() if "%b" in fmt or "%B" in fmt else s
            return datetime.strptime(base, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def _find_labeled_date(text: str, labels: list[str]) -> Field:
    lowered = text.lower()
    for label in labels:
        idx = lowered.find(label)
        while idx != -1:
            window = text[idx: idx + len(label) + 40]
            m = _DATE_RE.search(window)
            if m:
                iso = _normalize_date(m.group(0))
                if iso:
                    return Field(value=iso, confidence=0.85, raw=window.strip())
            idx = lowered.find(label, idx + 1)
    return Field()


def extract_fields(text: str, catalog: list[dict[str, Any]],
                   roster: Optional[list[dict[str, Any]]] = None) -> dict[str, Field]:
    fields: dict[str, Field] = {}
    text = re.sub(r"[\u2010-\u2015\u2212]", "-", text)  # normalize dashes
    flat = re.sub(r"[ \t]+", " ", text)

    code_field, name_field, prov_field = Field(), Field(), Field()
    catalog_codes = [c["code"] for c in catalog]

    m = _CODE_RE.search(flat.upper())
    if m:
        raw_code = re.sub(r"\s", "-", m.group(1).upper())
        best, score = _best_match(raw_code, catalog_codes)
        if best and score >= 0.6:
            entry = next(c for c in catalog if c["code"] == best)
            code_field = Field(value=best, confidence=round(score, 2), raw=m.group(1))
            name_field = Field(value=entry["name"], confidence=round(score, 2))
            prov_field = Field(value=entry["provider"], confidence=round(score, 2))

    if not code_field.value:
        lines = [ln.lower() for ln in flat.splitlines() if ln.strip()]
        best_entry = None
        best_cov, best_ntok = 0.0, 0
        for entry in catalog:
            candidates = [entry["name"].lower()] + [a.lower() for a in entry.get("aliases", [])]
            for cand in candidates:
                cand_tokens = {t for t in re.findall(r"[a-z0-9]+", cand)
                               if t not in _STOP and len(t) > 2}
                if not cand_tokens:
                    continue
                for ln in lines:
                    ln_tokens = {t for t in re.findall(r"[a-z0-9]+", ln)
                                 if t not in _STOP and len(t) > 2}
                    if not ln_tokens:
                        continue
                    coverage = len(cand_tokens & ln_tokens) / len(cand_tokens)
                    ntok = len(cand_tokens)
                    if (coverage, ntok) > (best_cov, best_ntok):
                        best_cov, best_ntok = coverage, ntok
                        best_entry = entry
        if best_entry and best_cov >= 0.7:
            code_field = Field(value=best_entry["code"], confidence=round(best_cov, 2),
                               raw="(matched by name)")
            name_field = Field(value=best_entry["name"], confidence=round(best_cov, 2))
            prov_field = Field(value=best_entry["provider"], confidence=round(best_cov, 2))

    fields["certification_code"] = code_field
    fields["certification_name"] = name_field
    fields["provider"] = prov_field

    # member name
    name_val = Field()
    nm = _NAME_TRIGGERS.search(text) or _NAME_BEFORE.search(text)
    if nm:
        candidate = nm.group(1)
        candidate = re.split(
            r"\s{2,}|\b(?:for|has|have|is|was|successfully|earned|received|"
            r"completed|the|certification|certificate|on|dated)\b",
            candidate, flags=re.IGNORECASE)[0]
        candidate = _CODE_RE.split(candidate)[0]
        candidate = _DATE_RE.split(candidate)[0]
        candidate = re.sub(r"[^A-Za-z .'\-]", " ", candidate)
        candidate = re.sub(r"\s+", " ", candidate).strip(" .:-")
        _NAME_STOP = {"by", "microsoft", "aws", "amazon", "google", "cisco",
                      "oracle", "the", "logo", "inc", "corporation", "learn",
                      "credentials", "credential"}
        words = candidate.split()
        while words and words[0].lower() in _NAME_STOP:
            words.pop(0)
        candidate = " ".join(words[:5])
        if 2 <= len(candidate) <= 60:
            name_val = Field(value=candidate, confidence=0.6, raw=nm.group(0).strip())
    fields["member_name"] = name_val

    email_val = Field()
    if roster and name_val.value:
        names = [r.get("name", "") for r in roster]
        best, score = _best_match(name_val.value, names)
        if best and score >= 0.72:
            matched = next(r for r in roster if r.get("name") == best)
            name_val.value = best
            name_val.confidence = round(max(name_val.confidence, score), 2)
            email_val = Field(value=matched.get("email"), confidence=round(score, 2),
                              raw=f"matched roster '{best}'")
    fields["member_email"] = email_val

    # certificate number
    cn = _CERTNO_PRIMARY.search(text)
    conf = 0.8
    if not cn:
        cn = _CERTNO_FALLBACK.search(text)
        conf = 0.65
    fields["certificate_number"] = (Field(value=cn.group(1).strip(), confidence=conf,
                                          raw=cn.group(0).strip()) if cn else Field())

    # dates
    fields["issue_date"] = _find_labeled_date(text, _DATE_LABELS_ISSUE)
    fields["expiration_date"] = _find_labeled_date(text, _DATE_LABELS_EXPIRE)
    if not fields["issue_date"].value:
        all_dates = _DATE_RE.findall(text)
        isos = [d for d in (_normalize_date(x) for x in all_dates) if d]
        if len(isos) == 1:
            fields["issue_date"] = Field(value=isos[0], confidence=0.5,
                                        raw="(only date on document)")
    return fields


def _blend_confidence(ocr_conf: float, fields: dict[str, Field]) -> float:
    code_c = fields["certification_code"].confidence
    name_c = fields["member_name"].confidence
    date_c = fields["issue_date"].confidence
    score = 0.40 * code_c + 0.25 * name_c + 0.15 * date_c + 0.20 * ocr_conf
    return round(min(score, 1.0), 3)


def extract_from_image(image_path: str,
                       catalog: Optional[list[dict[str, Any]]] = None,
                       roster: Optional[list[dict[str, Any]]] = None,
                       lang: str = "eng",
                       review_threshold: float = 0.75,
                       debug_dir: Optional[str] = None) -> ExtractionResult:
    catalog = catalog or DEFAULT_CATALOG
    result = ExtractionResult(source_file=image_path)
    try:
        debug_path = None
        if debug_dir:
            os.makedirs(debug_dir, exist_ok=True)
            base = os.path.splitext(os.path.basename(image_path))[0]
            debug_path = os.path.join(debug_dir, f"{base}_preprocessed.png")

        gray = preprocess(image_path, debug_path=debug_path)
        text, ocr_conf = run_ocr(gray, lang=lang)
        result.ocr_text = text.strip()[:4000]
        result.ocr_confidence = round(ocr_conf, 3)

        fields = extract_fields(text, catalog, roster)
        result.certification_code = fields["certification_code"]
        result.certification_name = fields["certification_name"]
        result.provider = fields["provider"]
        result.member_name = fields["member_name"]
        result.member_email = fields["member_email"]
        result.issue_date = fields["issue_date"]
        result.expiration_date = fields["expiration_date"]
        result.certificate_number = fields["certificate_number"]

        result.overall_confidence = _blend_confidence(ocr_conf, fields)
        result.needs_review = result.overall_confidence < review_threshold

        if not result.certification_code.value:
            result.warnings.append("Certification not recognized against catalog.")
        if not result.member_name.value:
            result.warnings.append("Member name not found.")
        if roster and result.member_name.value and not result.member_email.value:
            result.warnings.append("Member name not matched to roster.")
        if not result.issue_date.value:
            result.warnings.append("Issue date not found.")
        if ocr_conf < 0.5:
            result.warnings.append(f"Low OCR confidence ({ocr_conf:.2f}); image may be poor quality.")
    except Exception as exc:
        logger.exception("Extraction failed for %s", image_path)
        result.ok = False
        result.error = str(exc)
        result.needs_review = True
    return result


def extract_batch(image_paths: list[str], catalog=None, roster=None,
                  lang: str = "eng", review_threshold: float = 0.75,
                  debug_dir: Optional[str] = None) -> list[ExtractionResult]:
    results = []
    for i, path in enumerate(image_paths, 1):
        logger.info("[%d/%d] Processing %s", i, len(image_paths), path)
        results.append(extract_from_image(
            path, catalog=catalog, roster=roster, lang=lang,
            review_threshold=review_threshold, debug_dir=debug_dir))
    return results


def results_to_json(results: list[ExtractionResult]) -> dict[str, Any]:
    items = []
    for r in results:
        d = asdict(r)
        d["update_payload"] = r.to_update_payload()
        items.append(d)
    auto = sum(1 for r in results if r.ok and not r.needs_review)
    review = sum(1 for r in results if r.ok and r.needs_review)
    failed = sum(1 for r in results if not r.ok)
    return {"summary": {"total": len(results), "auto_acceptable": auto,
                        "needs_review": review, "failed": failed},
            "results": items}


_LIST_CODE_RE = re.compile(r"\b([A-Z]{2,4}[-\s]?\d{2,4}|AWS[-\s]?[A-Z]{2,4})\b")


def extract_cert_list(image_path: str, lang: str = "eng") -> dict[str, Any]:
    """OCR an image and return every certification code + nearby name found.

    Useful for admins importing a list of recommended certifications from a
    screenshot/image. Returns {"ok": bool, "error": str|None, "certs": [...]}.
    """
    try:
        gray = preprocess(image_path)
        text, _ = run_ocr(gray, lang=lang)
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        certs: list[dict[str, Any]] = []
        seen: set[str] = set()
        for ln in lines:
            upper = ln.upper()
            m = _LIST_CODE_RE.search(upper)
            if not m:
                continue
            raw_code = re.sub(r"\s", "-", m.group(1).upper())
            if raw_code in seen:
                continue
            seen.add(raw_code)
            # Name = text after the code token on the same line (or next line).
            name = ln[m.end():].strip(" :-|·")
            if not name:
                nxt = lines[lines.index(ln) + 1] if lines.index(ln) + 1 < len(lines) else ""
                name = nxt.strip(" :-|·")
            certs.append({"code": raw_code, "name": name})
        return {"ok": True, "error": None, "certs": certs}
    except Exception as exc:
        logger.exception("Cert-list extraction failed for %s", image_path)
        return {"ok": False, "error": str(exc), "certs": []}


def _load_json(path: Optional[str]) -> Optional[Any]:
    if not path:
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="Extract certification info from images using EasyOCR (no binary).")
    parser.add_argument("images", nargs="+", help="One or more image paths.")
    parser.add_argument("--catalog", help="JSON: [{code,name,provider,aliases[]}].")
    parser.add_argument("--roster", help="JSON: [{name,email}].")
    parser.add_argument("--lang", default="eng", help="e.g. 'eng' or 'eng+jpn'.")
    parser.add_argument("--threshold", type=float, default=0.75)
    parser.add_argument("--out", help="Write full JSON results to this file.")
    parser.add_argument("--debug-dir", help="Save pre-processed images here.")
    parser.add_argument("--list-certs", action="store_true",
                        help="Extract every cert code+name from the image(s) instead of full fields.")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO if args.verbose else logging.WARNING,
        format="%(levelname)s %(name)s: %(message)s")

    if args.list_certs:
        payload = {"summary": {"total": len(args.images)}, "certs": []}
        for img in args.images:
            payload["certs"].extend(extract_cert_list(img, lang=args.lang).get("certs", []))
        if args.out:
            with open(args.out, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            print(f"Wrote {args.out}")
        else:
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    catalog = _load_json(args.catalog) or DEFAULT_CATALOG
    roster = _load_json(args.roster)

    results = extract_batch(args.images, catalog=catalog, roster=roster,
                            lang=args.lang, review_threshold=args.threshold,
                            debug_dir=args.debug_dir)
    payload = results_to_json(results)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
        print(f"Wrote {args.out}")

    s = payload["summary"]
    print(f"\n=== Summary: {s['total']} image(s) | auto-ok: {s['auto_acceptable']} | "
          f"review: {s['needs_review']} | failed: {s['failed']} ===")
    for r in results:
        tag = "OK " if (r.ok and not r.needs_review) else ("REV" if r.ok else "ERR")
        print(f"[{tag}] {os.path.basename(r.source_file)} -> "
              f"cert={r.certification_code.value} member={r.member_name.value} "
              f"issued={r.issue_date.value} conf={r.overall_confidence}")
    return 0


if __name__ == "__main__":
    sys.exit(main())