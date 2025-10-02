
import json
import sys
import trimesh
import numpy as np

def generate_pocket_for_slice(polygons, tool_diameter, stepover_ratio):
    """
    Generates pocketing toolpaths for a list of polygons on a single Z-level.
    """
    slice_toolpaths = []
    if not polygons:
        return slice_toolpaths

    for polygon in polygons:
        # Ensure polygon is closed
        if not np.array_equal(polygon.vertices[0], polygon.vertices[-1]):
            polygon = trimesh.load_path(np.vstack((polygon.vertices, polygon.vertices[0])))

        # Inward offsets until the polygon disappears
        offset_distance = tool_diameter * stepover_ratio
        current_polygon = polygon
        
        # First path is an offset of tool_radius
        initial_offset = tool_diameter / 2.0
        
        try:
            # Generate the boundary path
            boundary_path = current_polygon.offset_polygon(-initial_offset)
            if not boundary_path.is_empty:
                for entity in boundary_path.entities:
                    slice_toolpaths.append(entity.points)

            # Generate subsequent clearing paths
            total_offset = initial_offset + offset_distance
            while not current_polygon.is_empty:
                offset_paths = current_polygon.offset_polygon(-total_offset)
                if offset_paths.is_empty:
                    break
                
                for entity in offset_paths.entities:
                    # Trimesh might return paths in reverse order, check and fix
                    if not trimesh.path.util.is_ccw(entity.points):
                        entity.points = np.flip(entity.points, axis=0)
                    slice_toolpaths.append(entity.points)

                total_offset += offset_distance
        except Exception as e:
            # This can happen if the polygon is too small for the offset
            continue
            
    return slice_toolpaths

def main():
    try:
        params = json.loads(sys.argv[1])
        stock_path = params['stockPath']
        target_path = params['targetPath']
        slice_height = float(params['sliceHeight'])
        tool_diameter = float(params['toolDiameter'])
        stepover_ratio = float(params['stepoverRatio'])

        # Load meshes
        stock_mesh = trimesh.load(stock_path)
        target_mesh = trimesh.load(target_path)

        # Perform boolean difference
        # This operation finds the volume to be removed
        to_cut_mesh = stock_mesh.difference(target_mesh, engine='blender')

        # Check if the result is empty
        if not isinstance(to_cut_mesh, trimesh.Trimesh) or to_cut_mesh.is_empty:
            print(json.dumps({"status": "success", "toolpaths": []}))
            return

        # Get the Z-range for slicing
        min_z, max_z = to_cut_mesh.bounds[:, 2]

        # Create slice heights
        slice_levels = np.arange(min_z + slice_height, max_z, slice_height)

        all_toolpaths = []

        for z in reversed(slice_levels):
            # Get the 2D cross-section of the mesh at the current Z-level
            slice_2d = to_cut_mesh.section(plane_origin=[0, 0, z], plane_normal=[0, 0, 1])
            
            if not slice_2d or slice_2d.is_empty:
                continue

            # The result of section is a Path2D object which can contain multiple polygons
            polygons = slice_2d.polygons_full
            
            # Generate pocketing paths for these polygons
            slice_toolpaths_2d = generate_pocket_for_slice(polygons, tool_diameter, stepover_ratio)

            # Convert 2D paths to 3D paths at the current Z-level
            for path_2d in slice_toolpaths_2d:
                path_3d = np.hstack((path_2d, np.full((len(path_2d), 1), z)))
                all_toolpaths.append({'type': 'line', 'points': path_3d.tolist()})

        print(json.dumps({"status": "success", "toolpaths": all_toolpaths}))

    except Exception as e:
        print(json.dumps({"status": "error", "message": str(e)}))

if __name__ == "__main__":
    main()
