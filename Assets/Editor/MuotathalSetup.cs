using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.UI;

namespace Muotathal.EditorTools
{
    /// <summary>
    /// Richtet das Projekt beim ersten Öffnen automatisch ein:
    /// Android-Einstellungen setzen und die Testszene "Muotathal_Test" bauen.
    /// Später jederzeit über das Menü "Muotathal" wiederholbar.
    /// </summary>
    [InitializeOnLoad]
    public static class MuotathalSetup
    {
        const string ScenePath = "Assets/Scenes/Muotathal_Test.unity";
        const string GeneratedFolder = "Assets/Generated";

        static MuotathalSetup()
        {
            EditorApplication.delayCall += () =>
            {
                if (EditorApplication.isPlayingOrWillChangePlaymode) return;
                if (File.Exists(ScenePath)) return;
                ApplyProjectSettings();
                BuildTestScene();
            };
        }

        // ------------------------------------------------------------------ Menü

        [MenuItem("Muotathal/Testszene neu bauen")]
        static void RebuildFromMenu()
        {
            if (!EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo()) return;
            BuildTestScene();
        }

        [MenuItem("Muotathal/Android-Einstellungen setzen")]
        static void ApplySettingsFromMenu()
        {
            ApplyProjectSettings();
            Debug.Log("Muotathal: Android-Einstellungen gesetzt.");
        }

        // ------------------------------------------------------------------ Einstellungen

        public static void ApplyProjectSettings()
        {
            PlayerSettings.companyName = "IkHai";
            PlayerSettings.productName = "Muotathal";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.ikhai.muotathal");

            // Querformat, beide Richtungen
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.AutoRotation;
            PlayerSettings.allowedAutorotateToPortrait = false;
            PlayerSettings.allowedAutorotateToPortraitUpsideDown = false;
            PlayerSettings.allowedAutorotateToLandscapeLeft = true;
            PlayerSettings.allowedAutorotateToLandscapeRight = true;

            // Moderne 64-Bit-Handys (nötig für den Play Store)
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;

            AssetDatabase.SaveAssets();
        }

        // ------------------------------------------------------------------ Szene

        public static void BuildTestScene()
        {
            EnsureFolder("Assets/Scenes");
            EnsureFolder(GeneratedFolder);
            EnsureFolder(GeneratedFolder + "/Materials");
            EnsureFolder(GeneratedFolder + "/Meshes");

            Scene scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var mats = new Materials();

            SetupLightingAndSky();
            GameObject world = new GameObject("Welt");
            BuildValley(world.transform, mats);

            GameObject player = BuildPlayer(mats);
            GameObject car = BuildCar(mats, new Vector3(-6.5f, 0f, -10f), 0f);

            Camera cam = BuildCamera();
            var follow = cam.gameObject.AddComponent<Muotathal.ThirdPersonCamera>();
            follow.target = player.transform;
            player.GetComponent<Muotathal.PlayerController>().cameraTransform = cam.transform;
            player.GetComponent<Muotathal.PlayerVehicleSwitcher>().followCamera = follow;

            BuildUI();

            var boot = new GameObject("Spielstart");
            boot.AddComponent<Muotathal.GameBootstrap>();

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Debug.Log("Muotathal: Testszene erstellt unter " + ScenePath + ". Drücke Play zum Testen.");
        }

        static void SetupLightingAndSky()
        {
            var sun = new GameObject("Sonne");
            var light = sun.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.15f;
            light.color = new Color(1f, 0.96f, 0.88f);
            light.shadows = LightShadows.Hard; // harte Schatten sind auf dem Handy günstiger
            sun.transform.rotation = Quaternion.Euler(48f, -35f, 0f);
            RenderSettings.sun = light;

            RenderSettings.skybox = null;
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.62f, 0.72f, 0.85f);
            RenderSettings.ambientEquatorColor = new Color(0.55f, 0.58f, 0.55f);
            RenderSettings.ambientGroundColor = new Color(0.30f, 0.32f, 0.25f);

            // Dunst im Tal, versteckt auch das Ende der Welt
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = SkyColor;
            RenderSettings.fogStartDistance = 90f;
            RenderSettings.fogEndDistance = 380f;
        }

        static readonly Color SkyColor = new Color(0.68f, 0.80f, 0.92f);

        /// <summary>
        /// Ein Tal von Süden nach Norden (z-Achse): Strasse, Fluss (Muota), kleines Dorf,
        /// Tannen und Berge auf beiden Seiten. Nur Platzhalter zum Testen!
        /// </summary>
        static void BuildValley(Transform parent, Materials m)
        {
            // Talboden 500 x 500 m
            GameObject ground = GameObject.CreatePrimitive(PrimitiveType.Plane);
            ground.name = "Talboden";
            ground.transform.SetParent(parent);
            ground.transform.localScale = new Vector3(50f, 1f, 50f);
            Paint(ground, m.Grass);

            // Strasse und Fluss (nur zum Anschauen, ohne Kollision)
            Strip("Strasse", parent, new Vector3(-5f, 0.02f, 0f), new Vector3(7f, 0.04f, 480f), m.Road);
            Strip("Mittellinie", parent, new Vector3(-5f, 0.045f, 0f), new Vector3(0.15f, 0.01f, 480f), m.White);
            Strip("Fluss", parent, new Vector3(22f, 0.03f, 0f), new Vector3(9f, 0.04f, 480f), m.Water);

            // Dorf
            var village = new GameObject("Dorf").transform;
            village.SetParent(parent);
            Vector3[] houses =
            {
                new Vector3(-18f, 0f, 6f), new Vector3(-20f, 0f, 24f), new Vector3(-34f, 0f, 14f),
                new Vector3(-17f, 0f, 44f), new Vector3(-36f, 0f, 38f), new Vector3(7f, 0f, 30f),
                new Vector3(-22f, 0f, -22f),
            };
            for (int i = 0; i < houses.Length; i++)
                House(village, houses[i], (i * 37f) % 20f - 10f, i % 3 == 0 ? m.Plaster : m.Wood, m);

            // Kirche mit Turm als Orientierungspunkt
            Block("Kirche", village, new Vector3(-30f, 4f, 60f), new Vector3(9f, 8f, 16f), 0f, m.Plaster);
            Block("Kirchturm", village, new Vector3(-30f, 9f, 70f), new Vector3(4f, 18f, 4f), 0f, m.Plaster);
            Roof("Turmdach", village, new Vector3(-30f, 18f, 70f), new Vector3(4.6f, 5f, 4.6f), 0f, m.RoofDark);
            Roof("Kirchendach", village, new Vector3(-30f, 8f, 59f), new Vector3(10f, 4f, 17f), 0f, m.RoofDark);

            // Kisten zum Draufspringen
            var boxes = new GameObject("Sprungkisten").transform;
            boxes.SetParent(parent);
            for (int i = 0; i < 4; i++)
                Block("Kiste " + (i + 1), boxes, new Vector3(4f + i * 2.2f, 0.4f + i * 0.4f, -18f),
                    new Vector3(2f, 0.8f + i * 0.8f, 2f), 0f, m.Wood);

            // Berge links und rechts
            var mountains = new GameObject("Berge").transform;
            mountains.SetParent(parent);
            var rnd = new System.Random(42);
            int index = 0;
            for (int side = -1; side <= 1; side += 2)
                for (float z = -230f; z <= 230f; z += 55f)
                {
                    float x = side * (140f + (float)rnd.NextDouble() * 40f);
                    float width = 100f + (float)rnd.NextDouble() * 60f;
                    float height = 90f + (float)rnd.NextDouble() * 110f;
                    Mesh mesh = SaveMesh(LowPolyMeshes.Mountain(100 + index), "Berg_" + index);
                    GameObject mtn = MeshObject("Berg " + (index + 1), mountains, mesh, m.Rock,
                        new Vector3(x, -2f, z + (float)rnd.NextDouble() * 20f),
                        new Vector3(width, height, width * 0.9f), (float)rnd.NextDouble() * 360f);
                    mtn.AddComponent<MeshCollider>().sharedMesh = mesh;
                    index++;
                }

            // Tannenwald
            var forest = new GameObject("Wald").transform;
            forest.SetParent(parent);
            Mesh firMesh = SaveMesh(LowPolyMeshes.Fir(7), "Tanne");
            int placed = 0;
            for (int tries = 0; placed < 120 && tries < 2000; tries++)
            {
                float x = (float)rnd.NextDouble() * 140f - 70f;
                float z = (float)rnd.NextDouble() * 460f - 230f;
                if (Mathf.Abs(x + 5f) < 7f || Mathf.Abs(x - 22f) < 8f) continue;   // nicht auf Strasse/Fluss
                if (x > -45f && x < 12f && z > -30f && z < 80f) continue;           // nicht im Dorf
                if (Mathf.Abs(x) < 15f && Mathf.Abs(z + 15f) < 15f) continue;        // nicht beim Start
                Tree(forest, firMesh, new Vector3(x, 0f, z), 0.8f + (float)rnd.NextDouble() * 0.6f, m);
                placed++;
            }

            // Alles Unbewegliche als statisch markieren (schneller auf dem Handy)
            foreach (Transform t in parent.GetComponentsInChildren<Transform>())
                GameObjectUtility.SetStaticEditorFlags(t.gameObject,
                    StaticEditorFlags.BatchingStatic | StaticEditorFlags.OccluderStatic | StaticEditorFlags.OccludeeStatic);
        }

        static GameObject BuildPlayer(Materials m)
        {
            var player = new GameObject("Spieler");
            player.tag = "Player";
            player.transform.position = new Vector3(0f, 0.05f, -14f);

            var cc = player.AddComponent<CharacterController>();
            cc.height = 1.8f;
            cc.radius = 0.35f;
            cc.center = new Vector3(0f, 0.9f, 0f);
            cc.stepOffset = 0.45f;
            cc.slopeLimit = 50f;

            player.AddComponent<Muotathal.PlayerController>();
            player.AddComponent<Muotathal.PlayerVehicleSwitcher>();

            // Platzhalter-Figur: Körper, Kopf und eine "Nase", damit man die Blickrichtung sieht
            Part(PrimitiveType.Capsule, "Koerper", player.transform, new Vector3(0f, 0.75f, 0f), new Vector3(0.6f, 0.6f, 0.45f), m.Shirt);
            Part(PrimitiveType.Sphere, "Kopf", player.transform, new Vector3(0f, 1.58f, 0f), new Vector3(0.36f, 0.36f, 0.36f), m.Skin);
            Part(PrimitiveType.Cube, "Muetze", player.transform, new Vector3(0f, 1.76f, 0.04f), new Vector3(0.34f, 0.1f, 0.4f), m.Car);
            Part(PrimitiveType.Cube, "Nase", player.transform, new Vector3(0f, 1.58f, 0.2f), new Vector3(0.08f, 0.08f, 0.1f), m.Skin);
            return player;
        }

        static GameObject BuildCar(Materials m, Vector3 position, float yaw)
        {
            var car = new GameObject("Auto");
            car.transform.SetPositionAndRotation(position + Vector3.up * 0.05f, Quaternion.Euler(0f, yaw, 0f));

            var rb = car.AddComponent<Rigidbody>();
            rb.mass = 1200f;
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            rb.constraints = RigidbodyConstraints.FreezeRotationX | RigidbodyConstraints.FreezeRotationZ;

            var box = car.AddComponent<BoxCollider>();
            box.center = new Vector3(0f, 0.75f, 0f);
            box.size = new Vector3(1.8f, 1.5f, 4.2f);

            var controller = car.AddComponent<Muotathal.CarController>();

            Part(PrimitiveType.Cube, "Karosserie", car.transform, new Vector3(0f, 0.65f, 0f), new Vector3(1.8f, 0.6f, 4.2f), m.Car);
            Part(PrimitiveType.Cube, "Kabine", car.transform, new Vector3(0f, 1.2f, -0.3f), new Vector3(1.6f, 0.55f, 2.2f), m.Glass);
            Part(PrimitiveType.Cube, "Licht links", car.transform, new Vector3(-0.6f, 0.7f, 2.11f), new Vector3(0.35f, 0.18f, 0.02f), m.White);
            Part(PrimitiveType.Cube, "Licht rechts", car.transform, new Vector3(0.6f, 0.7f, 2.11f), new Vector3(0.35f, 0.18f, 0.02f), m.White);

            const float r = 0.35f;
            Vector3[] wheelPos =
            {
                new Vector3(-0.85f, r, 1.35f), new Vector3(0.85f, r, 1.35f),
                new Vector3(-0.85f, r, -1.35f), new Vector3(0.85f, r, -1.35f),
            };
            var wheels = new Transform[4];
            for (int i = 0; i < 4; i++)
            {
                GameObject w = Part(PrimitiveType.Cylinder, "Rad " + (i + 1), car.transform, wheelPos[i], new Vector3(r * 2f, 0.14f, r * 2f), m.Tire);
                w.transform.localRotation = Quaternion.Euler(0f, 0f, 90f);
                wheels[i] = w.transform;
            }
            controller.wheels = wheels;
            controller.wheelRadius = r;

            var exit = new GameObject("Ausstieg").transform;
            exit.SetParent(car.transform, false);
            exit.localPosition = new Vector3(-1.9f, 0f, 0.2f);
            controller.exitPoint = exit;
            return car;
        }

        static Camera BuildCamera()
        {
            var go = new GameObject("Hauptkamera");
            go.tag = "MainCamera";
            var cam = go.AddComponent<Camera>();
            cam.clearFlags = CameraClearFlags.SolidColor;
            cam.backgroundColor = SkyColor;
            cam.fieldOfView = 60f;
            cam.nearClipPlane = 0.2f;
            cam.farClipPlane = 420f;
            go.AddComponent<AudioListener>();
            go.transform.position = new Vector3(0f, 3f, -19f);
            return cam;
        }

        // ------------------------------------------------------------------ Touch-Oberfläche

        static void BuildUI()
        {
            var canvasGo = new GameObject("Touch-Steuerung");
            var canvas = canvasGo.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            var scaler = canvasGo.AddComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 1f; // Querformat: nach Höhe skalieren
            canvasGo.AddComponent<GraphicRaycaster>();
            var controls = canvasGo.AddComponent<Muotathal.MobileControls>();

            Sprite circle = AssetDatabase.GetBuiltinExtraResource<Sprite>("UI/Skin/Knob.psd");
            Font font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

            // Rechte Seite: Kamera wischen (zuerst anlegen, damit Knöpfe darüber liegen)
            RectTransform lookArea = Panel("Kamera-Bereich", canvasGo.transform, new Vector2(0.4f, 0f), new Vector2(1f, 1f));
            controls.lookArea = lookArea.gameObject.AddComponent<Muotathal.TouchLookArea>();

            // Linke Seite: Joystick
            RectTransform moveArea = Panel("Joystick-Bereich", canvasGo.transform, new Vector2(0f, 0f), new Vector2(0.4f, 0.85f));
            var joystick = moveArea.gameObject.AddComponent<Muotathal.VirtualJoystick>();
            RectTransform bg = Circle("Joystick-Ring", moveArea, circle, new Vector2(260f, 260f), new Color(1f, 1f, 1f, 0.22f));
            bg.anchorMin = bg.anchorMax = Vector2.zero;
            bg.anchoredPosition = new Vector2(260f, 240f);
            RectTransform handle = Circle("Joystick-Knopf", bg, circle, new Vector2(120f, 120f), new Color(1f, 1f, 1f, 0.6f));
            joystick.background = bg;
            joystick.handle = handle;
            joystick.radius = 110f;

            // Knöpfe rechts unten
            controls.gasButton = Button("Gas", "Gas", canvasGo.transform, circle, font, new Vector2(-180f, 190f), 210f, new Color(0.3f, 0.9f, 0.35f, 0.45f));
            controls.brakeButton = Button("Bremse", "Bremse", canvasGo.transform, circle, font, new Vector2(-420f, 140f), 170f, new Color(0.95f, 0.3f, 0.25f, 0.45f));
            controls.jumpButton = Button("Springen", "Springen", canvasGo.transform, circle, font, new Vector2(-180f, 190f), 190f, new Color(0.35f, 0.6f, 1f, 0.45f));
            controls.enterButton = Button("Einsteigen", "Einsteigen", canvasGo.transform, circle, font, new Vector2(-200f, 450f), 160f, new Color(1f, 0.85f, 0.2f, 0.5f));

            // FPS-Anzeige oben links
            var fpsGo = new GameObject("FPS-Anzeige", typeof(RectTransform));
            fpsGo.transform.SetParent(canvasGo.transform, false);
            var fpsRect = (RectTransform)fpsGo.transform;
            fpsRect.anchorMin = fpsRect.anchorMax = fpsRect.pivot = new Vector2(0f, 1f);
            fpsRect.anchoredPosition = new Vector2(30f, -20f);
            fpsRect.sizeDelta = new Vector2(300f, 60f);
            var fpsText = fpsGo.AddComponent<Text>();
            fpsText.font = font;
            fpsText.fontSize = 36;
            fpsText.color = Color.white;
            fpsText.raycastTarget = false;
            fpsText.text = "-- FPS";
            fpsGo.AddComponent<Outline>();
            fpsGo.AddComponent<Muotathal.FpsCounter>().label = fpsText;

            // EventSystem verarbeitet die Berührungen
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            // Das passende Eingabe-Modul (altes oder neues Input-System) wird beim Start automatisch gewählt
            es.AddComponent<Muotathal.EventSystemSetup>();
        }

        static RectTransform Panel(string name, Transform parent, Vector2 min, Vector2 max)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = min;
            rt.anchorMax = max;
            rt.pivot = Vector2.zero;
            rt.offsetMin = rt.offsetMax = Vector2.zero;
            var img = go.AddComponent<Image>();
            img.color = new Color(1f, 1f, 1f, 0f); // unsichtbar, fängt aber Berührungen
            return rt;
        }

        static RectTransform Circle(string name, Transform parent, Sprite sprite, Vector2 size, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.sizeDelta = size;
            var img = go.AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.raycastTarget = false;
            return rt;
        }

        static Muotathal.TouchButton Button(string name, string label, Transform parent, Sprite sprite, Font font,
            Vector2 position, float size, Color color)
        {
            var go = new GameObject(name + "-Knopf", typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(1f, 0f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = position;
            rt.sizeDelta = new Vector2(size, size);
            var img = go.AddComponent<Image>();
            img.sprite = sprite;
            img.color = color;

            var textGo = new GameObject("Text", typeof(RectTransform));
            textGo.transform.SetParent(go.transform, false);
            var trt = (RectTransform)textGo.transform;
            trt.anchorMin = Vector2.zero;
            trt.anchorMax = Vector2.one;
            trt.offsetMin = trt.offsetMax = Vector2.zero;
            var text = textGo.AddComponent<Text>();
            text.font = font;
            text.text = label;
            text.fontSize = 32;
            text.fontStyle = FontStyle.Bold;
            text.alignment = TextAnchor.MiddleCenter;
            text.color = Color.white;
            text.raycastTarget = false;
            textGo.AddComponent<Outline>();

            var button = go.AddComponent<Muotathal.TouchButton>();
            button.image = img;
            button.label = text;
            button.normalColor = color;
            button.pressedColor = new Color(color.r, color.g, color.b, Mathf.Min(1f, color.a + 0.35f));
            return button;
        }

        // ------------------------------------------------------------------ Bausteine

        static void House(Transform parent, Vector3 pos, float yaw, Material walls, Materials m)
        {
            var house = new GameObject("Haus").transform;
            house.SetParent(parent);
            house.SetPositionAndRotation(pos, Quaternion.Euler(0f, yaw, 0f));
            Block("Mauern", house, new Vector3(0f, 2.75f, 0f), new Vector3(8f, 5.5f, 10f), 0f, walls, true);
            Roof("Dach", house, new Vector3(0f, 5.5f, 0f), new Vector3(9.6f, 3.2f, 11.6f), 0f, m.Roof, true);
            Block("Tuer", house, new Vector3(0f, 1.1f, -5.02f), new Vector3(1.3f, 2.2f, 0.1f), 0f, m.RoofDark, true);
            for (int i = -1; i <= 1; i += 2)
                Block("Fenster", house, new Vector3(i * 2.5f, 3.4f, -5.02f), new Vector3(1.2f, 1.1f, 0.1f), 0f, m.Glass, true);
        }

        static void Tree(Transform parent, Mesh firMesh, Vector3 pos, float scale, Materials m)
        {
            var tree = new GameObject("Tanne").transform;
            tree.SetParent(parent);
            tree.position = pos;
            GameObject trunk = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            trunk.name = "Stamm";
            trunk.transform.SetParent(tree, false);
            trunk.transform.localPosition = new Vector3(0f, 1f * scale, 0f);
            trunk.transform.localScale = new Vector3(0.45f, 1f, 0.45f) * scale;
            Paint(trunk, m.Bark);
            MeshObject("Nadeln", tree, firMesh, m.Pine, pos + Vector3.up * 1.2f * scale,
                new Vector3(4f, 9f, 4f) * scale, pos.x * 13f % 360f);
        }

        static GameObject Block(string name, Transform parent, Vector3 pos, Vector3 size, float yaw, Material mat, bool local = false)
        {
            GameObject go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            go.transform.SetParent(parent, false);
            if (local) go.transform.localPosition = pos; else go.transform.position = pos;
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            go.transform.localScale = size;
            Paint(go, mat);
            return go;
        }

        static void Roof(string name, Transform parent, Vector3 pos, Vector3 size, float yaw, Material mat, bool local = false)
        {
            Mesh mesh = AssetDatabase.LoadAssetAtPath<Mesh>(GeneratedFolder + "/Meshes/Dach.asset");
            if (mesh == null) mesh = SaveMesh(LowPolyMeshes.Roof(), "Dach");
            GameObject go = MeshObject(name, parent, mesh, mat, pos, size, yaw, local);
            go.AddComponent<MeshCollider>().sharedMesh = mesh;
        }

        static GameObject MeshObject(string name, Transform parent, Mesh mesh, Material mat, Vector3 pos, Vector3 scale, float yaw, bool local = false)
        {
            var go = new GameObject(name);
            go.transform.SetParent(parent, false);
            if (local) go.transform.localPosition = pos; else go.transform.position = pos;
            go.transform.localRotation = Quaternion.Euler(0f, yaw, 0f);
            go.transform.localScale = scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            return go;
        }

        static void Strip(string name, Transform parent, Vector3 pos, Vector3 size, Material mat)
        {
            GameObject go = Block(name, parent, pos, size, 0f, mat);
            Object.DestroyImmediate(go.GetComponent<Collider>());
        }

        static GameObject Part(PrimitiveType type, string name, Transform parent, Vector3 localPos, Vector3 scale, Material mat)
        {
            GameObject go = GameObject.CreatePrimitive(type);
            go.name = name;
            Object.DestroyImmediate(go.GetComponent<Collider>()); // Kollision macht das Hauptobjekt
            go.transform.SetParent(parent, false);
            go.transform.localPosition = localPos;
            go.transform.localScale = scale;
            Paint(go, mat);
            return go;
        }

        static void Paint(GameObject go, Material mat)
        {
            var r = go.GetComponent<Renderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = ShadowCastingMode.On;
        }

        static Mesh SaveMesh(Mesh mesh, string name)
        {
            string path = GeneratedFolder + "/Meshes/" + name + ".asset";
            AssetDatabase.DeleteAsset(path);
            AssetDatabase.CreateAsset(mesh, path);
            return mesh;
        }

        static void EnsureFolder(string path)
        {
            if (AssetDatabase.IsValidFolder(path)) return;
            string parent = Path.GetDirectoryName(path).Replace('\\', '/');
            EnsureFolder(parent);
            AssetDatabase.CreateFolder(parent, Path.GetFileName(path));
        }

        /// <summary>Einfarbige, matte Materialien im Low-Poly-Stil.</summary>
        class Materials
        {
            public readonly Material Grass = Make("Gras", new Color(0.36f, 0.55f, 0.24f));
            public readonly Material Rock = Make("Fels", new Color(0.47f, 0.46f, 0.43f));
            public readonly Material Road = Make("Strasse", new Color(0.25f, 0.25f, 0.27f));
            public readonly Material Water = Make("Wasser", new Color(0.25f, 0.50f, 0.62f), 0.6f);
            public readonly Material White = Make("Weiss", new Color(0.93f, 0.93f, 0.90f));
            public readonly Material Wood = Make("Holz", new Color(0.52f, 0.33f, 0.18f));
            public readonly Material Plaster = Make("Verputz", new Color(0.90f, 0.87f, 0.80f));
            public readonly Material Roof = Make("Dach", new Color(0.42f, 0.22f, 0.16f));
            public readonly Material RoofDark = Make("Dach dunkel", new Color(0.22f, 0.16f, 0.13f));
            public readonly Material Glass = Make("Glas", new Color(0.35f, 0.48f, 0.58f), 0.5f);
            public readonly Material Pine = Make("Tannennadeln", new Color(0.14f, 0.33f, 0.18f));
            public readonly Material Bark = Make("Rinde", new Color(0.33f, 0.22f, 0.14f));
            public readonly Material Car = Make("Autolack", new Color(0.80f, 0.12f, 0.10f), 0.4f);
            public readonly Material Tire = Make("Reifen", new Color(0.08f, 0.08f, 0.08f));
            public readonly Material Shirt = Make("Hemd", new Color(0.20f, 0.35f, 0.70f));
            public readonly Material Skin = Make("Haut", new Color(0.92f, 0.74f, 0.60f));

            static Material Make(string name, Color color, float smoothness = 0f)
            {
                string path = GeneratedFolder + "/Materials/" + name + ".mat";
                var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
                if (mat == null)
                {
                    mat = new Material(Shader.Find("Standard"));
                    AssetDatabase.CreateAsset(mat, path);
                }
                mat.color = color;
                mat.SetFloat("_Glossiness", smoothness);
                mat.enableInstancing = true;
                EditorUtility.SetDirty(mat);
                return mat;
            }
        }
    }
}
