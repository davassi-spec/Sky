"""Vista previa rapida del STL (z-buffer por vertices) desde varios angulos."""
import sys
import numpy as np
import trimesh
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

mesh = trimesh.load(sys.argv[1])
out = sys.argv[2]
V = mesh.vertices - mesh.bounds.mean(axis=0)
N = mesh.vertex_normals


def vista(yaw, W=500, H=700, pitch=0.0, zoom=1.0, centro_y=0.0):
    a, p = np.radians(yaw), np.radians(pitch)
    Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
    Rx = np.array([[1, 0, 0], [0, np.cos(p), -np.sin(p)], [0, np.sin(p), np.cos(p)]])
    R = Rx @ Ry
    P = V @ R.T
    Nn = N @ R.T
    luz = np.array([0.5, 0.6, 0.8]); luz /= np.linalg.norm(luz)
    sh = np.clip(Nn @ luz, 0, 1) * 0.8 + 0.2
    s = zoom * H / (mesh.extents[1] * 1.05)
    px = (P[:, 0] * s + W / 2).astype(int)
    py = (H / 2 - (P[:, 1] - centro_y) * s).astype(int)
    img = np.ones((H, W)) * 0.95
    zb = np.full((H, W), -1e9)
    ok = (px >= 1) & (px < W - 1) & (py >= 1) & (py < H - 1) & (Nn[:, 2] > -0.2)
    order = np.argsort(P[ok, 2])
    for dx in (-1, 0, 1):
        for dy in (-1, 0, 1):
            xi, yi, zi, si = px[ok][order] + dx, py[ok][order] + dy, P[ok, 2][order], sh[ok][order]
            m = zi > zb[yi, xi]
            zb[yi[m], xi[m]] = zi[m]
            img[yi[m], xi[m]] = si[m]
    return img


fig, ax = plt.subplots(1, 4, figsize=(16, 6))
for a, (yaw, t) in zip(ax, [(0, "frente"), (35, "3/4"), (90, "perfil"), (180, "atras")]):
    a.imshow(vista(yaw), cmap="gray", vmin=0, vmax=1); a.set_title(t); a.axis("off")
plt.tight_layout(); plt.savefig(out, dpi=80)

# primer plano de cara
fig, ax = plt.subplots(1, 3, figsize=(15, 6))
for a, yaw in zip(ax, [0, 30, 75]):
    a.imshow(vista(yaw, W=600, H=600, zoom=2.6, centro_y=mesh.extents[1] * 0.22), cmap="gray", vmin=0, vmax=1); a.axis("off")
plt.tight_layout(); plt.savefig(out.replace(".png", "_cara.png"), dpi=80)
