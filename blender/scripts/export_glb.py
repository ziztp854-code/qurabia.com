"""Deterministic, web-safe GLB export for objects in the WEB_EXPORT collection."""

import argparse
import os
import re
import sys
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parents[2]
MODELS_DIR = (ROOT / "apps" / "web" / "public" / "models").resolve()


def parse_args():
    args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--output")
    parser.add_argument("--collection", default="WEB_EXPORT")
    parser.add_argument("--include-cameras", action="store_true")
    parser.add_argument("--include-lights", action="store_true")
    return parser.parse_args(args)


def web_slug(value):
    if not re.fullmatch(r"[a-z0-9][a-z0-9_-]*", value):
        raise ValueError("Use lowercase ASCII letters, digits, underscores and hyphens in filenames.")
    return value


def output_path(requested):
    source_name = Path(bpy.data.filepath).stem or "model"
    candidate = Path(requested).resolve() if requested else MODELS_DIR / f"{web_slug(source_name)}.glb"
    if candidate.suffix.lower() != ".glb":
        raise ValueError("Export output must use the .glb extension.")
    web_slug(candidate.stem)
    if os.path.commonpath((MODELS_DIR, candidate)) != str(MODELS_DIR):
        raise ValueError(f"Export output must stay inside {MODELS_DIR}")
    candidate.parent.mkdir(parents=True, exist_ok=True)
    return candidate


def export_objects(collection_name, include_cameras, include_lights):
    collection = bpy.data.collections.get(collection_name)
    if collection is None:
        raise ValueError(f"Collection not found: {collection_name}")
    allowed = {"MESH", "EMPTY", "ARMATURE"}
    if include_cameras:
        allowed.add("CAMERA")
    if include_lights:
        allowed.add("LIGHT")
    objects = [obj for obj in collection.all_objects if obj.type in allowed]
    if not objects:
        raise ValueError(f"Collection {collection_name} contains no exportable objects.")
    return objects


def referenced_images(objects):
    images = set()
    visited = set()

    def collect_images(tree):
        if tree is None or tree in visited:
            return
        visited.add(tree)
        for node in tree.nodes:
            if getattr(node, "image", None):
                images.add(node.image)
            collect_images(getattr(node, "node_tree", None))

    for obj in objects:
        for slot in obj.material_slots:
            if slot.material:
                collect_images(slot.material.node_tree)
    return images


def validate_scene(objects):
    missing = []
    images = referenced_images(objects)
    for image in images:
        if image.source == "FILE" and not image.packed_file:
            path = Path(bpy.path.abspath(image.filepath, library=image.library))
            if not path.is_file():
                missing.append(str(path))
    if missing:
        raise ValueError("Missing texture files:\n" + "\n".join(missing))
    for obj in objects:
        if obj.type == "MESH":
            obj.data.validate(clean_customdata=False)
            obj.data.calc_loop_triangles()


def optimization_settings():
    raw_size = os.environ.get("BLENDER_MAX_TEXTURE_SIZE", "2048")
    if not re.fullmatch(r"[0-9]+", raw_size) or not 256 <= int(raw_size) <= 8192:
        raise ValueError("BLENDER_MAX_TEXTURE_SIZE must be an integer from 256 to 8192.")
    draco = os.environ.get("BLENDER_DRACO", "0")
    if draco not in {"0", "1"}:
        raise ValueError("BLENDER_DRACO must be 0 or 1.")
    return int(raw_size), draco == "1"


def optimize_textures(objects, maximum):
    for image in referenced_images(objects):
        width, height = image.size
        if width <= 0 or height <= 0:
            raise ValueError(f"Texture has no readable pixels: {image.name}")
        if max(width, height) > maximum:
            ratio = maximum / max(width, height)
            size = (max(1, round(width * ratio)), max(1, round(height * ratio)))
            image.scale(*size)
            print(f"[export_glb] texture {image.name}: {width}x{height} -> {size[0]}x{size[1]} (memory only)")


def compatible_export_options(**requested):
    supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    missing = set(requested) - supported
    if missing:
        raise RuntimeError("Blender glTF exporter lacks required options: " + ", ".join(sorted(missing)))
    return requested


def main():
    if not (4, 0, 0) <= bpy.app.version < (6, 0, 0):
        raise RuntimeError("Supported Blender versions are 4.x and 5.x.")
    args = parse_args()
    maximum, draco = optimization_settings()
    destination = output_path(args.output)
    objects = export_objects(args.collection, args.include_cameras, args.include_lights)
    validate_scene(objects)
    optimize_textures(objects, maximum)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in objects:
        obj.hide_set(False)
        obj.hide_render = False
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]

    compression = {
        "export_draco_mesh_compression_level": 6,
    } if draco else {}
    options = compatible_export_options(
        filepath=str(destination),
        export_format="GLB",
        use_selection=True,
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_materials="EXPORT",
        export_animations=True,
        export_skins=True,
        export_morph=True,
        export_cameras=args.include_cameras,
        export_lights=args.include_lights,
        export_yup=True,
        export_apply=False,
        export_optimize_animation_size=True,
        export_draco_mesh_compression_enable=draco,
        **compression,
    )
    print(f"[export_glb] texture limit: {maximum}px; Draco: {'enabled (level 6)' if draco else 'disabled'}")
    result = bpy.ops.export_scene.gltf(**options)
    if "FINISHED" not in result or not destination.is_file():
        raise RuntimeError(f"GLB export did not finish: {result}")
    print(f"[export_glb] wrote {destination} ({destination.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
