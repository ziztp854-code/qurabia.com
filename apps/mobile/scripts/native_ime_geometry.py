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


def ime_frame(dump, width, height):
    # Android WindowManager InsetsSource uses screen coordinates. Prefer its
    # visible IME frame; unrelated app/parent/display frames are never accepted.
    insets = []
    for line in dump.splitlines():
        if not (re.search(r"\b(?:mType=|type=)?ime\b", line, re.IGNORECASE) and
                re.search(r"\b(?:mVisible|visible)=true\b", line)):
            continue
        match = re.search(r"\b(?:mFrame|frame)=(\[\d+,\d+\]\[\d+,\d+\])", line)
        if match:
            rect = bounded_rect(list(map(int, re.findall(r"\d+", match.group(1)))), width, height)
            if rect:
                insets.append(rect)
    if insets:
        return insets[0] if all(rect == insets[0] for rect in insets) else None
    frames = []
    for block in re.split(r"(?=^[ \t]*Window #\d+ Window\{)", dump, flags=re.MULTILINE):
        header = block.splitlines()[0] if block.splitlines() else ""
        if (not re.search(r"\bInputMethod\b", header) or
                re.search(r"\b(?:mHasSurface|isVisible|isOnScreen)=false\b|\bmViewVisibility=0x[48]\b", block)):
            continue
        match = re.search(r"\b(?:mFrame|frame)=(\[\d+,\d+\]\[\d+,\d+\])", block)
        if match:
            rect = bounded_rect(list(map(int, re.findall(r"\d+", match.group(1)))), width, height)
        else:
            legacy = re.search(r"\bmFrame=Rect\((\d+),\s*(\d+)\s*-\s*(\d+),\s*(\d+)\)", block)
            rect = bounded_rect(list(map(int, legacy.groups())), width, height) if legacy else None
        if rect:
            frames.append(rect)
    return frames[0] if frames and all(rect == frames[0] for rect in frames) else None


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
        windows = device.adb("shell", "dumpsys", "window", "windows")
        frame = ime_frame(windows.stdout, width, height) if windows.returncode == 0 else None
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
