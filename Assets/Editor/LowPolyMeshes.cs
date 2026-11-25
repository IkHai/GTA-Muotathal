using System.Collections.Generic;
using UnityEngine;

namespace Muotathal.EditorTools
{
    /// <summary>
    /// Erzeugt einfache Low-Poly-Formen (Berge, Tannen, Dächer) mit harten Kanten,
    /// wie in 3D-Spielen der frühen 2000er.
    /// </summary>
    public static class LowPolyMeshes
    {
        /// <summary>Berg: Kegel mit zufällig verschobenen Punkten. Grösse 1x1x1, wird per Skalierung angepasst.</summary>
        public static Mesh Mountain(int seed, int segments = 9, int rings = 4, float roughness = 0.18f)
        {
            var rnd = new System.Random(seed);
            float R() => (float)(rnd.NextDouble() * 2.0 - 1.0);

            var ringPoints = new Vector3[rings, segments];
            for (int r = 0; r < rings; r++)
            {
                float t = r / (float)rings;
                for (int s = 0; s < segments; s++)
                {
                    float angle = (s + R() * 0.25f) / segments * Mathf.PI * 2f;
                    float radius = (1f - t) * (1f + R() * roughness);
                    float h = r == 0 ? 0f : Mathf.Pow(t, 0.85f) + R() * roughness * 0.4f;
                    ringPoints[r, s] = new Vector3(Mathf.Cos(angle) * radius * 0.5f, h, Mathf.Sin(angle) * radius * 0.5f);
                }
            }
            Vector3 peak = new Vector3(R() * 0.05f, 1f, R() * 0.05f);

            var b = new Builder();
            for (int r = 0; r < rings - 1; r++)
                for (int s = 0; s < segments; s++)
                {
                    int n = (s + 1) % segments;
                    b.Quad(ringPoints[r, s], ringPoints[r, n], ringPoints[r + 1, n], ringPoints[r + 1, s], AxisOutward);
                }
            for (int s = 0; s < segments; s++)
                b.Tri(ringPoints[rings - 1, s], ringPoints[rings - 1, (s + 1) % segments], peak, AxisOutward);
            return b.Build("Berg_" + seed);
        }

        /// <summary>Tanne: schlanker Kegel. Grösse 1x1x1.</summary>
        public static Mesh Fir(int seed)
        {
            return Rename(Mountain(seed, 7, 2, 0.08f), "Tanne_" + seed);
        }

        /// <summary>Satteldach als dreieckiges Prisma. Breite x, Höhe y, Tiefe z jeweils 1.</summary>
        public static Mesh Roof()
        {
            Vector3 lf = new Vector3(-0.5f, 0f, -0.5f), rf = new Vector3(0.5f, 0f, -0.5f), tf = new Vector3(0f, 1f, -0.5f);
            Vector3 lb = new Vector3(-0.5f, 0f, 0.5f), rb = new Vector3(0.5f, 0f, 0.5f), tb = new Vector3(0f, 1f, 0.5f);
            var b = new Builder();
            System.Func<Vector3, Vector3> outward = c => c - new Vector3(0f, 0.33f, 0f);
            b.Tri(lf, rf, tf, outward);
            b.Tri(lb, rb, tb, outward);
            b.Quad(lf, lb, tb, tf, outward);
            b.Quad(rf, rb, tb, tf, outward);
            b.Quad(lf, rf, rb, lb, outward);
            return b.Build("Dach");
        }

        static Vector3 AxisOutward(Vector3 c) => new Vector3(c.x, 0.15f, c.z);

        static Mesh Rename(Mesh m, string name) { m.name = name; return m; }

        /// <summary>Baut ein Mesh mit eigenen Ecken pro Dreieck (harte, flache Schattierung).</summary>
        class Builder
        {
            readonly List<Vector3> vertices = new List<Vector3>();
            readonly List<int> triangles = new List<int>();

            public void Tri(Vector3 a, Vector3 b, Vector3 c, System.Func<Vector3, Vector3> outward)
            {
                Vector3 normal = Vector3.Cross(b - a, c - a);
                if (Vector3.Dot(normal, outward((a + b + c) / 3f)) < 0f) { Vector3 tmp = b; b = c; c = tmp; }
                int i = vertices.Count;
                vertices.Add(a); vertices.Add(b); vertices.Add(c);
                triangles.Add(i); triangles.Add(i + 1); triangles.Add(i + 2);
            }

            public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d, System.Func<Vector3, Vector3> outward)
            {
                Tri(a, b, c, outward);
                Tri(a, c, d, outward);
            }

            public Mesh Build(string name)
            {
                var mesh = new Mesh { name = name };
                mesh.SetVertices(vertices);
                mesh.SetTriangles(triangles, 0);
                mesh.RecalculateNormals();
                mesh.RecalculateBounds();
                return mesh;
            }
        }
    }
}
