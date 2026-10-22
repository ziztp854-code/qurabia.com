"""Private-value-free Android IME geometry shared by native QA only."""
import re

MAX_COORDINATE = 16384


def bounded_rect(value, width, height):
    if not isinstance(value, (tuple, list)) or len(value) != 4:
        return None
    if any(type(item) is not int for item in value):
        return None
    left, top, right, bottom = value
    if not (0 < width <= MAX_COORDINATE and 0 < height <= MAX_COORDINATE and
            0 <= left < right <= width and 0 <= top < bottom <= height):
        return None
    return list(value)


def node_bounds(node):
    if node is None:
        return None
    match = re.fullmatch(r"\[(\d+),(\d+)\]\[(\d+),(\d+)\]", node.attrib.get("bounds", ""))
    return list(map(int, match.groups())) if match else None


def inspect_ime_sources(dump, width, height):
    # A Window frame is the IME surface, often nearly full-screen. It is never
    # evidence of occupied keyboard space. Accept only explicit InsetsSource.
    records = re.findall(r"\bInsetsSource(?::\s*\{[^{}]*\}|[ \t]+[^\n{}]*)", dump)
    evidence = {"source_records": min(len(records), 32), "ime_records": 0,
                "visible_ime_records": 0, "hidden_ime_records": 0,
                "bounded_frames": 0, "invalid_frames": 0, "conflicting_frames": False,
                "record_formats": [], "frame_formats": []}
    frames, visible_count = [], 0
    for record in records:
        if not re.search(r"\b(?:mType|type)\s*=\s*ime\b", record):
            continue
        evidence["ime_records"] = min(32, evidence["ime_records"] + 1)
        style = "brace" if re.match(r"InsetsSource:\s*\{", record) else "dump_line"
        if style not in evidence["record_formats"]:
            evidence["record_formats"].append(style)
        visibility = re.findall(r"\b(?:mVisible|visible)\s*=\s*(true|false)\b", record)
        if visibility == ["false"]:
            evidence["hidden_ime_records"] = min(32, evidence["hidden_ime_records"] + 1)
        if visibility != ["true"]:
            continue
        visible_count += 1
        evidence["visible_ime_records"] = min(32, visible_count)
        match = re.search(r"\b(?:mFrame|frame)\s*=\s*\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]", record)
        style = "brackets"
        if not match:
            match = re.search(r"\b(?:mFrame|frame)\s*=\s*Rect\((-?\d+),\s*(-?\d+)\s*-\s*(-?\d+),\s*(-?\d+)\)", record)
            style = "rect" if match else "missing"
        if style not in evidence["frame_formats"]:
            evidence["frame_formats"].append(style)
        frame = bounded_rect(list(map(int, match.groups())), width, height) if match else None
        if frame is None:
            evidence["invalid_frames"] = min(32, evidence["invalid_frames"] + 1)
        else:
            frames.append(frame)
            evidence["bounded_frames"] = min(32, len(frames))
    if frames:
        evidence["conflicting_frames"] = any(frame != frames[0] for frame in frames)
    valid = frames and len(frames) == visible_count and not evidence["conflicting_frames"]
    return (frames[0] if valid else None), evidence


def ime_frame(dump, width, height):
    return inspect_ime_sources(dump, width, height)[0]


def observe(device, field_bounds, width, height, require_shown=False):
    field = bounded_rect(field_bounds, width, height)
    screen = bounded_rect([0, 0, width, height], width, height)
    dump = device.adb("shell", "dumpsys", "input_method")
    flags = re.findall(r"\b(?:mInputShown|mIsInputViewShown)=(true|false)\b", dump.stdout)
    keyboard = ("shown" if "true" in flags else "hidden" if flags else "unknown") if dump.returncode == 0 else "unknown"
    result = {"keyboard": keyboard, "screen_bounds_px": screen, "field_bounds_px": field,
              "ime_bounds_px": None, "overlaps_ime": None, "reachable": False, "reason": "field_bounds_invalid"}
    if not field or not screen:
        return result
    if keyboard == "unknown" or (require_shown and keyboard != "shown"):
        result["reason"] = "ime_visibility_unknown" if keyboard == "unknown" else "ime_not_shown"
        return result
    if keyboard == "shown":
        frame = None
        result["ime_source_observations"] = {}
        for query in ("displays", "windows"):
            response = device.adb("shell", "dumpsys", "window", query)
            frame, diagnostic = inspect_ime_sources(
                response.stdout if response.returncode == 0 else "", width, height)
            diagnostic["query_result"] = "success" if response.returncode == 0 else "nonzero_exit"
            result["ime_source_observations"][query] = diagnostic
            if frame is not None:
                result["ime_source_query"] = query
                break
            if diagnostic["ime_records"]:
                # Do not replace contradictory/hidden raw IME state with a
                # possibly stale per-window source snapshot.
                break
        result["ime_bounds_px"] = frame
        if frame is None:
            result["reason"] = "ime_geometry_unknown"
            return result
        result["overlaps_ime"] = (max(field[0], frame[0]) < min(field[2], frame[2]) and
                                  max(field[1], frame[1]) < min(field[3], frame[3]))
        if result["overlaps_ime"]:
            result["reason"] = "field_overlaps_ime"
            return result
    else:
        result["overlaps_ime"] = False
    result.update(reachable=True, reason="reachable")
    return result
