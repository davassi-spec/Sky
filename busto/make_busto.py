"""Genera un busto imprimible (STL) a partir de primitivas implícitas (SDF) + marching cubes.

Unidades internas: mm "reales" de un busto a tamaño natural. El STL final se escala
a ALTURA_FINAL_MM para imprimir.
Ejes: x = derecha, y = arriba, z = hacia delante (la cara mira a +z).
"""
import sys
import numpy as np
import trimesh
from skimage import measure

ALTURA_FINAL_MM = 150.0
RES = 1.4  # mm reales por voxel

xs = np.arange(-215, 215 + RES, RES, dtype=np.float32)
ys = np.arange(-330, 125 + RES, RES, dtype=np.float32)
zs = np.arange(-135, 135 + RES, RES, dtype=np.float32)
X = xs[:, None, None]
Y = ys[None, :, None]
Z = zs[None, None, :]


def ell(c, r, rot_z=0.0, rot_x=0.0):
    x, y, z = X - c[0], Y - c[1], Z - c[2]
    if rot_z:
        cs, sn = np.cos(rot_z), np.sin(rot_z)
        x, y = cs * x + sn * y, -sn * x + cs * y
    if rot_x:
        cs, sn = np.cos(rot_x), np.sin(rot_x)
        y, z = cs * y + sn * z, -sn * y + cs * z
    q = np.sqrt((x / r[0]) ** 2 + (y / r[1]) ** 2 + (z / r[2]) ** 2)
    return ((q - 1.0) * min(r)).astype(np.float32)


def sph(c, r):
    return ell(c, (r, r, r))


def cap(a, b, ra, rb=None):
    """Capsula entre a y b con radio variable."""
    rb = ra if rb is None else rb
    a, b = np.array(a, np.float32), np.array(b, np.float32)
    ab = b - a
    px, py, pz = X - a[0], Y - a[1], Z - a[2]
    t = (px * ab[0] + py * ab[1] + pz * ab[2]) / float(ab @ ab)
    t = np.clip(t, 0, 1)
    dx, dy, dz = px - t * ab[0], py - t * ab[1], pz - t * ab[2]
    d = np.sqrt(dx * dx + dy * dy + dz * dz)
    return (d - (ra + (rb - ra) * t)).astype(np.float32)


def smin(a, b, k):
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def sub(a, b, k=0.0):
    """a menos b (con suavizado opcional)."""
    if k <= 0:
        return np.maximum(a, -b)
    return -smin(-a, b, k)


def inter(a, b):
    return np.maximum(a, b)


def chain(shape, parts, k):
    for p in parts:
        shape = smin(shape, p, k)
    return shape


def z_surf(vol, x, y):
    """z de la superficie frontal del volumen en (x, y)."""
    ix = int(round((x - xs[0]) / RES)); iy = int(round((y - ys[0]) / RES))
    col = np.nonzero(vol[ix, iy, :] < 0)[0]
    return float(zs[col.max()]) if len(col) else 0.0


def ranura(vol, pts, r, k=1.5, dz=0.0):
    """Resta una ranura que sigue la superficie frontal a lo largo de pts=[(x,y),...]."""
    base = vol
    for (x0, y0), (x1, y1) in zip(pts[:-1], pts[1:]):
        vol = sub(vol, cap((x0, y0, z_surf(base, x0, y0) + dz), (x1, y1, z_surf(base, x1, y1) + dz), r), k)
    return vol


# ---------------------------------------------------------------- cabeza
cranio = ell((0, 12, -12), (74, 98, 98))
mandib = ell((0, -52, 8), (62, 66, 78))
cabeza = smin(cranio, mandib, 34)
menton = ell((0, -100, 58), (27, 22, 24))
cabeza = smin(cabeza, menton, 18)
# pomulos y mejillas
for s in (-1, 1):
    cabeza = smin(cabeza, sph((s * 48, -14, 58), 21), 16)
    cabeza = smin(cabeza, sph((s * 44, -64, 42), 25), 22)   # carrillos
    cabeza = smin(cabeza, ell((s * 38, 20, 76), (22, 8, 14), rot_z=s * -0.25), 10)  # arco ceja
cabeza = smin(cabeza, ell((0, 24, 84), (30, 9, 12)), 10)  # entrecejo/frente baja
cabeza = smin(cabeza, ell((0, 55, 78), (50, 30, 26)), 25)  # frente amplia

# ---------------------------------------------------------------- orejas (marcadas, algo separadas)
for s in (-1, 1):
    oreja = ell((s * 76, -6, -8), (8, 33, 21), rot_z=s * 0.12)
    cabeza = smin(cabeza, oreja, 5)
    cabeza = sub(cabeza, ell((s * 80, -4, -4), (5, 17, 10), rot_z=s * 0.12), 3)  # concha

# ---------------------------------------------------------------- nariz (grande, punta redondeada)
nariz = cap((0, 14, 84), (0, -30, 106), 10, 14)
cabeza = smin(cabeza, nariz, 8)
cabeza = smin(cabeza, sph((0, -32, 105), 15), 8)
for s in (-1, 1):
    cabeza = smin(cabeza, sph((s * 15, -34, 94), 10), 6)  # alas
cabeza = sub(cabeza, ell((0, -44, 98), (11, 4, 8)), 3)    # base de la nariz

# ---------------------------------------------------------------- ojos (sonrisa: parpados entornados)
for s in (-1, 1):
    cabeza = sub(cabeza, ell((s * 32, 8, 88), (15, 9, 10)), 5)
    cabeza = smin(cabeza, ell((s * 32, 8, 76), (12, 7, 9)), 4)
    cabeza = sub(cabeza, cap((s * 22, 9, 90), (s * 43, 12, 82), 1.8), 1.5)  # parpado
    # patas de gallo
    for dy in (-5, 1, 7):
        cabeza = sub(cabeza, cap((s * 48, 8 + dy * 0.4, 78), (s * 60, 8 + dy, 66), 1.2), 1.5)

# ---------------------------------------------------------------- boca (sonrisa ancha)
labio_sup = ell((0, -57, 82), (19, 5, 8))
labio_inf = ell((0, -72, 80), (16, 6, 8))
cabeza = smin(cabeza, labio_sup, 4)
cabeza = smin(cabeza, labio_inf, 4)
base_cara = cabeza
boca = [(x, -66 + 0.024 * x * x) for x in np.linspace(-27, 27, 12)]
cabeza = ranura(base_cara, boca, 2.0, 1.2, dz=1.0)
for sg in (-1, 1):
    cabeza = sub(cabeza, sph((sg * 28, -58, z_surf(base_cara, sg * 28, -58) + 1), 3.0), 1.5)
    cabeza = ranura(cabeza, [(sg * 18, -38), (sg * 24, -52), (sg * 30, -66)], 2.2, 3, dz=1.5)   # nasolabial
    cabeza = ranura(cabeza, [(sg * 52, 2), (sg * 58, -8), (sg * 54, -20)], 1.4, 3, dz=0.5)     # pata de gallo
    cabeza = ranura(cabeza, [(sg * 50, 6), (sg * 60, 4)], 1.2, 3, dz=0.5)
for yy in (40, 54):  # arrugas de la frente
    cabeza = ranura(cabeza, [(-32, yy), (0, yy + 1.5), (32, yy)], 1.2, 3, dz=0.5)

# ---------------------------------------------------------------- pelo corto en los lados/nuca (calvo arriba)
pelo_cascara = np.maximum(ell((0, 12, -12), (79, 103, 103)), -ell((0, 12, -12), (70, 94, 94)))
borde_sup = Y - (26 - 0.0035 * (Z + 12) ** 2 * 0.5 + 0.1 * (Z - 20))  # sube hacia atras, baja hacia las sienes
region = np.maximum(np.maximum(borde_sup, Z - 8), -(Y + 40))
pelo = np.maximum(pelo_cascara, region)
cabeza = smin(cabeza, pelo, 2.0)

# ---------------------------------------------------------------- cuello y torso
cuello = ell((0, -150, -14), (57, 85, 58))
cabeza = smin(cabeza, cuello, 28)
torso = ell((0, -272, -22), (178, 100, 104))
cuerpo = smin(cabeza, torso, 36)

# Escote en V del jersey y cuello de la camisa, sobre la superficie real
base = cuerpo
v = [(-50, -176), (-26, -206), (0, -236), (26, -206), (50, -176)]
for (x0, y0), (x1, y1) in zip(v[:-1], v[1:]):
    cuerpo = smin(cuerpo, cap((x0, y0, z_surf(base, x0, y0) + 1), (x1, y1, z_surf(base, x1, y1) + 1), 4.5), 3)
    cuerpo = sub(cuerpo, cap((x0 * 0.82, y0 + 3, z_surf(base, x0 * 0.82, y0 + 3) + 1.5),
                             (x1 * 0.82, y1 + 3, z_surf(base, x1 * 0.82, y1 + 3) + 1.5), 2.2), 2)

# plano de apoyo: recorte plano en la base
cuerpo = inter(cuerpo, -(Y + 295))
# ---------------------------------------------------------------- malla
vol = cuerpo
vol[0, :, :] = vol[-1, :, :] = vol[:, 0, :] = vol[:, -1, :] = vol[:, :, 0] = vol[:, :, -1] = 10
verts, faces, normals, _ = measure.marching_cubes(vol, level=0.0, spacing=(RES, RES, RES))
verts += np.array([xs[0], ys[0], zs[0]])

mesh = trimesh.Trimesh(verts, faces, vertex_normals=normals, process=True)
trimesh.smoothing.filter_taubin(mesh, iterations=8)
mesh.fix_normals()

alto = mesh.bounds[1][1] - mesh.bounds[0][1]
mesh.apply_scale(ALTURA_FINAL_MM / alto)
mesh.apply_translation([-mesh.centroid[0], -mesh.bounds[0][1], -mesh.centroid[2]])

print("caras:", len(mesh.faces), "watertight:", mesh.is_watertight, "volumen cm3: %.1f" % (mesh.volume / 1000))
print("tamano mm:", np.round(mesh.extents, 1))
out = sys.argv[1] if len(sys.argv) > 1 else "busto.stl"
mesh.export(out)
print("guardado", out)
