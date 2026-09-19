"""Create the configurable Tahaddi challenge-card source scene."""

import argparse
import os
import sys
from pathlib import Path

import bpy


def args():
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args(values)


def material(name, color, metallic, roughness, emission=None):
    value = bpy.data.materials.new(name)
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    if emission:
        input_name = "Emission Color" if "Emission Color" in shader.inputs else "Emission"
        shader.inputs[input_name].default_value = (*emission, 1)
        shader.inputs["Emission Strength"].default_value = 0.14
    return value


def move_to(obj, collection):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def box(collection, name, location, dimensions, mat, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("WebBevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 4
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    obj.data.materials.append(mat)
    move_to(obj, collection)
    return obj


def find_arabic_font():
    configured = os.environ.get("BLENDER_ARABIC_FONT")
    candidates = [
        configured,
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/tahoma.ttf",
        "/usr/share/fonts/truetype/noto/NotoSansArabic-Bold.ttf",
        "/System/Library/Fonts/Supplemental/Arial.ttf",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).is_file():
            return Path(candidate)
    raise RuntimeError("Arabic font not found. Set BLENDER_ARABIC_FONT to an Arabic-capable .ttf/.otf file.")


def add_text(collection, root, gold):
    curve = bpy.data.curves.new("ChallengeArabicText", "FONT")
    # Presentation forms are reversed for Blender's left-to-right text object; visually this reads «تحدي».
    curve.body = os.environ.get("BLENDER_ARABIC_TEXT", "ﻱﺪﺤﺗ")
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = 1.15
    curve.extrude = 0.045
    curve.bevel_depth = 0.012
    curve.font = bpy.data.fonts.load(str(find_arabic_font()))
    text = bpy.data.objects.new("ChallengeTitle_AR", curve)
    text.location = (0, -0.205, -0.05)
    text.rotation_euler[0] = 1.5707963267948966
    text.data.materials.append(gold)
    text["source_text"] = "تحدي"
    collection.objects.link(text)
    text.parent = root
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = text
    text.select_set(True)
    bpy.ops.object.convert(target="MESH")
    text.name = "ChallengeTitle_AR"


def main():
    options = args()
    output = Path(options.output).resolve()
    scenes = (Path(__file__).resolve().parents[1] / "scenes").resolve()
    if not output.is_relative_to(scenes):
        raise ValueError("Output must stay inside blender/scenes.")
    if output.exists() and not options.force:
        raise ValueError("Source already exists; use --force to replace it.")
    if not (4, 0, 0) <= bpy.app.version < (6, 0, 0):
        raise RuntimeError("Supported Blender versions are 4.x and 5.x.")
    if output.suffix.lower() != ".blend":
        raise ValueError("Output must use the .blend extension.")
    output.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.collections:
        if block.name != "Collection":
            bpy.data.collections.remove(block)

    export = bpy.data.collections.new("WEB_EXPORT")
    bpy.context.scene.collection.children.link(export)
    root = bpy.data.objects.new("ChallengeCardRoot", None)
    export.objects.link(root)

    ink = material("Card_Ink", (0.006, 0.014, 0.025), 0.68, 0.22)
    navy = material("Card_Navy", (0.018, 0.055, 0.1), 0.48, 0.26)
    gold = material("Card_Gold", (0.83, 0.57, 0.09), 0.92, 0.16, (0.12, 0.06, 0.005))
    ivory = material("Card_Ivory", (0.92, 0.84, 0.68), 0.08, 0.34)

    parts = [
        box(export, "CardBody", (0, 0, 0), (5.4, 0.28, 3.35), ink, 0.19),
        box(export, "CardFace", (0, -0.17, 0), (5.05, 0.08, 3.0), navy, 0.13),
        box(export, "FrameTop", (0, -0.24, 1.34), (4.62, 0.075, 0.075), gold, 0.035),
        box(export, "FrameBottom", (0, -0.24, -1.34), (4.62, 0.075, 0.075), gold, 0.035),
        box(export, "FrameLeft", (-2.27, -0.24, 0), (0.075, 0.075, 2.62), gold, 0.035),
        box(export, "FrameRight", (2.27, -0.24, 0), (0.075, 0.075, 2.62), gold, 0.035),
        box(export, "SubtitlePlate", (0, -0.23, -0.92), (2.25, 0.055, 0.28), ivory, 0.1),
    ]
    for obj in parts:
        obj.parent = root

    for x in (-2.18, 2.18):
        for z in (-1.24, 1.24):
            bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.095, location=(x, -0.31, z))
            gem = bpy.context.object
            gem.name = "GoldStud"
            gem.data.materials.append(gold)
            move_to(gem, export)
            gem.parent = root

    add_text(export, root, gold)

    root.rotation_mode = "XYZ"
    for frame, angle in ((1, -0.16), (80, 0.16), (160, -0.16)):
        root.rotation_euler[2] = angle
        root.keyframe_insert("rotation_euler", frame=frame)
    if root.animation_data and root.animation_data.action:
        root.animation_data.action.name = "CardFloat"
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 160
    engines = bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items.keys()
    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in engines else "BLENDER_EEVEE"
    bpy.context.scene.render.resolution_x = 1200
    bpy.context.scene.render.resolution_y = 800
    bpy.context.scene.render.resolution_percentage = 50
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    print(f"[create_challenge_card] wrote {output}")


if __name__ == "__main__":
    main()
