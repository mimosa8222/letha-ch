"""Generate a skinned one-piece dress for the base VRoid model, headless.

Run: python make_dress.py -- <input.glb> <output.glb>
(uses the `bpy` pip package = headless Blender 5.x)

The dress is built from the model's own body surface so it fits:
  * bodice  = torso + upper-arm skin, pushed out along normals (keeps the
              body's skin weights, so it deforms with the arms/torso)
  * skirt   = generated pleated flare from the waist to above the knee,
              weighted to the hips/upper legs by height
  * collar  = round (Peter-Pan-style) collar ring lying on the shoulders
  * waistband
Exports only the garment + armature; the web app rebinds it to the
avatar's skeleton by bone name.
"""
import sys
import math
import bpy
import bmesh
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, dst = argv[0], argv[1]

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o)
bpy.ops.import_scene.gltf(filepath=src)

arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
body = bpy.data.objects["Body"]
for o in list(bpy.data.objects):
    if o not in (arm, body):
        bpy.data.objects.remove(o)


def bone_pos(name):
    return arm.matrix_world @ arm.data.bones[name].head_local


neck = bone_pos("J_Bip_C_Neck")
hips = bone_pos("J_Bip_C_Hips")
spine = bone_pos("J_Bip_C_Spine")
l_upper_arm = bone_pos("J_Bip_L_UpperArm")
l_lower_leg = bone_pos("J_Bip_L_LowerLeg")
l_upper_leg = bone_pos("J_Bip_L_UpperLeg")
print("landmarks", neck, hips, spine, l_upper_arm, l_lower_leg)

waist_z = spine.z + 0.04  # natural waist
sleeve_x = abs(l_upper_arm.x) + 0.11  # short puff-ish sleeve
hem_z = l_lower_leg.z - 0.13          # mid-calf (Letha's 1960s dress)

# ── bodice: copy torso skin ─────────────────────────────────────────────
bodice = body.copy()
bodice.data = body.data.copy()
bodice.name = "Dress_Bodice"
bpy.context.collection.objects.link(bodice)
# VRoid deletes body skin hidden under clothes, so the bodice is cut from the
# T-shirt mesh (complete torso + sleeves), not from the skin.
skin_idx = [i for i, m in enumerate(bodice.data.materials) if "Tops" in m.name][0]

bm = bmesh.new()
bm.from_mesh(bodice.data)
mw = bodice.matrix_world
kill = []
for f in bm.faces:
    if f.material_index != skin_idx:
        kill.append(f)
        continue
    c = mw @ f.calc_center_median()
    # keep the whole shoulder line (cutting at neck height opened a seam on the shoulders)
    if c.z < waist_z - 0.03 or abs(c.x) > sleeve_x:
        kill.append(f)
bmesh.ops.delete(bm, geom=kill, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
# turn the boxy T-shirt into a fitted bodice: nip in the waist, puff the sleeves
chest_z = spine.z + 0.2
for v in bm.verts:
    w = mw @ v.co
    # position-based only (never per-normal), so split seam vertices stay welded
    k = max(0.0, min(1.0, (chest_z - w.z) / (chest_z - waist_z)))
    k = k * k * (3 - 2 * k)
    torso = 1 - max(0.0, min(1.0, (abs(w.x) - 0.1) / 0.05))  # fades out toward the sleeves
    # fitted 1960s bodice: clearly nipped waist, closer through the ribs
    slim = torso * (0.1 + 0.12 * k)
    v.co.x *= 1 - slim
    v.co.y = hips.y + (v.co.y - hips.y) * (1 - 0.75 * slim)
    # puff sleeves: push away from the arm axis (T-pose: arm runs along x), position-based
    ax = abs(w.x)
    if ax > 0.14:
        t = min(1.0, (ax - 0.14) / max(0.01, sleeve_x - 0.14))
        bump = math.sin(math.pi * min(1.0, t * 1.15)) * 0.016
        d = Vector((0, w.y - l_upper_arm.y, w.z - l_upper_arm.z))
        if d.length > 1e-5:
            d.normalize()
            v.co.y += d.y * bump
            v.co.z += d.z * bump
bm.to_mesh(bodice.data)
bm.free()
# never let the cloth sink into the skin: push any vertex closer than `margin`
# back outside the body surface (BVH nearest point + face normal)
from mathutils.bvhtree import BVHTree
_skin = bmesh.new()
_skin.from_mesh(body.data)
_si = [i for i, m in enumerate(body.data.materials) if "SKIN" in m.name][0]
bmesh.ops.delete(_skin, geom=[f for f in _skin.faces if f.material_index != _si], context="FACES")
bmesh.ops.transform(_skin, matrix=body.matrix_world, verts=_skin.verts)
_skin.normal_update()
skin_bvh = BVHTree.FromBMesh(_skin)


def keep_outside(ob, margin):
    mwo = ob.matrix_world
    inv = mwo.inverted()
    moved = 0
    for v in ob.data.vertices:
        p = mwo @ v.co
        loc, nrm, _i, dist = skin_bvh.find_nearest(p)
        if loc is None or dist > 0.04:
            continue
        if (p - loc).dot(nrm) < margin:
            v.co = inv @ (loc + nrm * margin)
            moved += 1
    print("keep_outside", ob.name, moved)


keep_outside(bodice, 0.005)
bodice.data.materials.clear()
def make_mat(name, rgb):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*rgb, 1)
    return m


dress_mat = make_mat("Dress_CLOTH", (0.03, 0.04, 0.09))
bodice.data.materials.append(dress_mat)

# measure the bodice at the waist to size the skirt
co = [mw @ v.co for v in bodice.data.vertices]
ring = [p for p in co if abs(p.z - waist_z) < 0.02 and abs(p.x) < 0.2]
wx = max(abs(p.x) for p in ring)
wy = max(abs(p.y - hips.y) for p in ring)
cy = sum(p.y for p in ring) / len(ring)
print("waist", waist_z, wx, wy)

# actual bodice outline at the waist, per angle (so band & skirt fit it exactly)
BINS = 72
ring_bins = [0.0] * BINS
for p in co:
    if abs(p.z - waist_z) < 0.025 and abs(p.x) < 0.2:
        a = math.atan2(p.x, -(p.y - cy)) % (2 * math.pi)  # 0 = front (-Y)
        b = int(a / (2 * math.pi) * BINS) % BINS
        ring_bins[b] = max(ring_bins[b], math.hypot(p.x, p.y - cy))
# where the sample is sparse (front centre), fall back to the fitted ellipse
for i in range(BINS):
    a = (i + 0.5) / BINS * 2 * math.pi
    ell_r = 1 / math.sqrt((math.sin(a) / wx) ** 2 + (math.cos(a) / wy) ** 2)
    ring_bins[i] = max(ring_bins[i], ell_r)
for _ in range(3):  # smooth
    ring_bins = [max(ring_bins[i], 0.5 * (ring_bins[i - 1] + ring_bins[(i + 1) % BINS])) for i in range(BINS)]
ring_bins = [(ring_bins[i - 1] + 2 * ring_bins[i] + ring_bins[(i + 1) % BINS]) / 4 for i in range(BINS)]


def ring_r(a):
    f = (a % (2 * math.pi)) / (2 * math.pi) * BINS
    i = int(f) % BINS
    t = f - int(f)
    return ring_bins[i] * (1 - t) + ring_bins[(i + 1) % BINS] * t

# ── skirt: pleated flare ───────────────────────────────────────────────
def make_ring_mesh(name, rows, seg, fn):
    bm = bmesh.new()
    grid = []
    for j in range(rows + 1):
        row = []
        for i in range(seg):
            row.append(bm.verts.new(fn(i / seg, j / rows)))
        grid.append(row)
    for j in range(rows):
        for i in range(seg):
            a, b = grid[j][i], grid[j][(i + 1) % seg]
            c, d = grid[j + 1][(i + 1) % seg], grid[j + 1][i]
            bm.faces.new((a, d, c, b))
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


top_z = waist_z + 0.01
hip_z = l_upper_leg.z
pleats = 16


def skirt_pt(u, v):
    a = u * 2 * math.pi
    z = top_z + (hem_z - top_z) * v
    # starts exactly on the waist outline, eases over the hips, flares to the hem
    hip_t = min(1.0, (top_z - z) / max(0.01, top_z - hip_z + 0.04))
    hip_t = hip_t * hip_t * (3 - 2 * hip_t)
    # soft A-line: just clears the hips, then falls fairly straight
    r = ring_r(a) + 0.004 + 0.022 * hip_t + 0.05 * v ** 1.6
    tri = abs(((u * pleats * 2) % 2) - 1)  # 0..1 triangle wave → knife pleats
    k = 1 + (0.003 + 0.035 * v) * (tri - 0.5)  # soft gathers, not stiff pleats
    return Vector((math.sin(a) * r * k, cy - math.cos(a) * r * k, z))


pleats = 24
skirt = make_ring_mesh("Dress_Skirt", 26, pleats * 10, skirt_pt)
keep_outside(skirt, 0.008)
skirt.data.materials.append(dress_mat)

# waistband
def band_pt(u, v):
    a = u * 2 * math.pi
    z = waist_z + 0.018 - 0.03 * v
    r = ring_r(a) + 0.007 - 0.002 * abs(v - 0.5)
    return Vector((math.sin(a) * r, cy - math.cos(a) * r, z))


band = make_ring_mesh("Dress_Waistband", 4, 144, band_pt)
band_mat = make_mat("Waistband_CLOTH", (0.015, 0.02, 0.05))
band.data.materials.append(band_mat)

# collar: round collar lying on the shoulders, open at the front
neck_r = 0.053
coll_mat = make_mat("Collar_CLOTH", (0.92, 0.9, 0.84))
body_eval = body.evaluated_get(bpy.context.evaluated_depsgraph_get())


def shoulder_z(x, y):
    # raycast down onto the body to drape the collar on the shoulder line
    origin = Vector((x, y, neck.z + 0.004))  # start below the chin so the head isn't hit
    inv = body.matrix_world.inverted()
    ok, loc, n, idx = body_eval.ray_cast(inv @ origin, Vector((0, 0, -1)))
    z = (body.matrix_world @ loc).z if ok else neck.z - 0.05
    # in front of the chest the ray would fall to the waist: keep it on the shoulder line
    return max(z, neck.z - 0.06)


gap = 0.12


def collar_pt(u, v):
    a = gap + u * (2 * math.pi - 2 * gap)  # a=0 → front (-Y)
    d = min(a, 2 * math.pi - a) - gap
    lobe = 0.7
    k = math.sqrt(max(0, 1 - ((lobe - d) / lobe) ** 2)) if d < lobe else 1
    r = neck_r + (0.03 + 0.048 * k) * v
    x, y = math.sin(a) * r, neck.y - math.cos(a) * r * 0.8
    return Vector((x, y, shoulder_z(x, y) + 0.014))


bm = bmesh.new()
rows, seg = 8, 160
pts = [[collar_pt(i / seg, j / rows) for i in range(seg + 1)] for j in range(rows + 1)]
# smooth the draped height along the collar so the edge is clean, not jagged
for j in range(rows + 1):
    zs = [p.z for p in pts[j]]
    for _ in range(6):
        zs = [zs[0]] + [(zs[i - 1] + 2 * zs[i] + zs[i + 1]) / 4 for i in range(1, seg)] + [zs[-1]]
    for i in range(seg + 1):
        pts[j][i].z = max(zs[i], pts[j][i].z - 0.004)
grid = [[bm.verts.new(p) for p in row] for row in pts]
uvl = bm.loops.layers.uv.new("UVMap")
coord = {}
for j in range(rows + 1):
    for i in range(seg + 1):
        coord[grid[j][i]] = (i / seg, 1 - j / rows)  # u along the collar, v: neck edge → outer edge
for j in range(rows):
    for i in range(seg):
        f = bm.faces.new((grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]))
        for loop in f.loops:
            loop[uvl].uv = coord[loop.vert]
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
me = bpy.data.meshes.new("Dress_Collar")
bm.to_mesh(me)
bm.free()
collar = bpy.data.objects.new("Dress_Collar", me)
bpy.context.collection.objects.link(collar)
collar.data.materials.append(coll_mat)
sol = collar.modifiers.new("thick", "SOLIDIFY")
sol.thickness = 0.006
sol.offset = 1

# gold button at the front of the collar
bodice_eval = bodice.evaluated_get(bpy.context.evaluated_depsgraph_get())
bz = neck.z - 0.048
inv = bodice.matrix_world.inverted()
ok, loc, n, idx = bodice_eval.ray_cast(inv @ Vector((0, -0.5, bz)), Vector((0, 1, 0)))
by = (bodice.matrix_world @ loc).y if ok else neck.y - 0.1
bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.0075, location=(0, by - 0.002, bz))
button = bpy.context.active_object
button.name = "Dress_Button"
button.scale = (1, 0.45, 1)
bpy.ops.object.transform_apply(scale=True)
button.data.materials.append(make_mat("Button_METAL", (0.75, 0.52, 0.16)))

# white crew socks grown from the leg skin (position-based push, seam-safe)
socks = body.copy()
socks.data = body.data.copy()
socks.name = "Socks"
bpy.context.collection.objects.link(socks)
skin_i = [i for i, m in enumerate(socks.data.materials) if "SKIN" in m.name][0]
sock_top = l_lower_leg.z - 0.2
bm = bmesh.new()
bm.from_mesh(socks.data)
kill = [f for f in bm.faces if f.material_index != skin_i or not (0.05 < (socks.matrix_world @ f.calc_center_median()).z < sock_top)]
bmesh.ops.delete(bm, geom=kill, context="FACES")
bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
for v in bm.verts:
    side = 1 if v.co.x > 0 else -1
    ax = Vector((side * abs(l_lower_leg.x), l_lower_leg.y))
    d = Vector((v.co.x - ax.x, v.co.y - ax.y))
    t = max(0.0, (v.co.z - (sock_top - 0.05)) / 0.05)  # slouchy, slightly looser top
    if d.length > 1e-5:
        d.normalize()
        push = 0.0035 + 0.004 * t
        v.co.x += d.x * push
        v.co.y += d.y * push
bm.to_mesh(socks.data)
bm.free()
socks.data.materials.clear()
socks.data.materials.append(make_mat("Socks_CLOTH", (0.92, 0.91, 0.88)))

# ── skin weights for generated parts ───────────────────────────────────
def weight_by_height(ob, groups):
    """groups: list of (bone, fn(world_pos) -> weight)"""
    for bone, _ in groups:
        if bone not in ob.vertex_groups:
            ob.vertex_groups.new(name=bone)
    for v in ob.data.vertices:
        p = ob.matrix_world @ v.co
        ws = [(b, max(0.0, fn(p))) for b, fn in groups]
        tot = sum(w for _, w in ws) or 1
        for b, w in ws:
            if w > 0:
                ob.vertex_groups[b].add([v.index], w / tot, "REPLACE")


def leg_share(p, side):
    t = max(0.0, min(1.0, (hip_z - p.z) / (hip_z - hem_z)))
    s = (p.x * side > 0)
    return 0.45 * t * (1.0 if s else 0.2)


weight_by_height(skirt, [
    ("J_Bip_C_Hips", lambda p: 1.0),
    ("J_Bip_L_UpperLeg", lambda p: leg_share(p, 1)),
    ("J_Bip_R_UpperLeg", lambda p: leg_share(p, -1)),
])
weight_by_height(band, [("J_Bip_C_Spine", lambda p: 1.0)])
weight_by_height(button, [("J_Bip_C_UpperChest", lambda p: 1.0)])
weight_by_height(collar, [
    ("J_Bip_C_UpperChest", lambda p: 1.0),
    ("J_Bip_L_Shoulder", lambda p: max(0.0, p.x - 0.04) * 8),
    ("J_Bip_R_Shoulder", lambda p: max(0.0, -p.x - 0.04) * 8),
])

# smooth subdivision for clean silhouettes (weights interpolate with it)
for ob in (bodice, collar):
    sub = ob.modifiers.new("smooth", "SUBSURF")
    sub.levels = 1
    sub.render_levels = 1
hem = skirt.modifiers.new("hem", "SOLIDIFY")
hem.thickness = 0.003

for ob in (skirt, band, collar, button):
    ob.parent = arm
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm
    for poly in ob.data.polygons:
        poly.use_smooth = True

# drop the original body from the export
bpy.data.objects.remove(body)
bpy.ops.object.select_all(action="DESELECT")
for ob in (arm, bodice, skirt, band, collar, button, socks):
    ob.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=dst,
    export_format="GLB",
    use_selection=True,
    export_skins=True,
    export_apply=True,  # bakes the solidify modifier
    export_morph=False,
    export_animations=False,
)
print("exported", dst)
