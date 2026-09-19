"""Run with Blender --background --python-exit-code 1 --python this_file."""

import os
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
from export_glb import optimization_settings, optimize_textures, referenced_images


def main():
    previous = {key: os.environ.get(key) for key in ("BLENDER_MAX_TEXTURE_SIZE", "BLENDER_DRACO")}
    try:
        for value in ("255", "8193", "1.5", "oops", "-1024"):
            os.environ["BLENDER_MAX_TEXTURE_SIZE"] = value
            try:
                optimization_settings()
            except ValueError:
                pass
            else:
                raise AssertionError(f"Accepted invalid texture limit: {value}")
        os.environ["BLENDER_MAX_TEXTURE_SIZE"] = "256"
        os.environ["BLENDER_DRACO"] = "1"
        assert optimization_settings() == (256, True)
        mesh = bpy.data.meshes.new("OptimizationTest")
        obj = bpy.data.objects.new("OptimizationTest", mesh)
        material = bpy.data.materials.new("OptimizationTest")
        material.use_nodes = True
        obj.data.materials.append(material)
        image = bpy.data.images.new("ExportedImage", width=1024, height=512)
        unused = bpy.data.images.new("UnusedImage", width=1024, height=1024)
        node = material.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = image
        assert referenced_images([obj]) == {image}
        optimize_textures([obj], 256)
        assert tuple(image.size) == (256, 128)
        assert tuple(unused.size) == (1024, 1024)
        assert image.is_dirty
        print("[test_export_glb] passed: settings validation, aspect ratio, selected images, memory-only scaling")
    finally:
        for key, value in previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value


if __name__ == "__main__":
    main()
