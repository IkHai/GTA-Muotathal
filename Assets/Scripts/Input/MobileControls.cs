using UnityEngine;
#if ENABLE_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Muotathal
{
    /// <summary>
    /// Zentrale Stelle für alle Eingaben. Kombiniert die Touch-Steuerung
    /// mit Tastatur und Maus (damit man im Unity-Editor ohne Handy testen kann).
    ///
    /// Tastatur im Editor: WASD = laufen / lenken, Leertaste = springen,
    /// E = ein-/aussteigen, W/S im Auto = Gas/Bremse, rechte Maustaste halten = Kamera.
    /// </summary>
    public class MobileControls : MonoBehaviour
    {
        public static MobileControls Instance { get; private set; }

        [Header("Touch-Elemente")]
        public VirtualJoystick moveJoystick;
        public TouchLookArea lookArea;
        public TouchButton gasButton;
        public TouchButton brakeButton;
        public TouchButton enterButton;
        public TouchButton jumpButton;

        [Header("Maus (nur Editor/PC)")]
        public float mouseLookScale = 1f;

        bool driving;
#if !ENABLE_INPUT_SYSTEM && ENABLE_LEGACY_INPUT_MANAGER && (UNITY_EDITOR || UNITY_STANDALONE)
        Vector2 lastMousePosition;
        bool mouseLookActive;
#endif

        void Awake()
        {
            Instance = this;
            SetDrivingMode(false);
        }

        void OnDestroy()
        {
            if (Instance == this) Instance = null;
        }

        /// <summary>Bewegungsrichtung, x = links/rechts, y = vor/zurück. Länge 0 bis 1.</summary>
        public Vector2 Move
        {
            get
            {
                Vector2 v = moveJoystick != null ? moveJoystick.Value : Vector2.zero;
                Vector2 k = new Vector2(
                    (Held(KeyCode.D, KeyCode.RightArrow) ? 1f : 0f) - (Held(KeyCode.A, KeyCode.LeftArrow) ? 1f : 0f),
                    (Held(KeyCode.W, KeyCode.UpArrow) ? 1f : 0f) - (Held(KeyCode.S, KeyCode.DownArrow) ? 1f : 0f));
                if (k.sqrMagnitude > 0f) v = k.normalized;
                return Vector2.ClampMagnitude(v, 1f);
            }
        }

        public bool Gas => (gasButton != null && gasButton.IsHeld) || Held(KeyCode.W, KeyCode.UpArrow);
        public bool Brake => (brakeButton != null && brakeButton.IsHeld) || Held(KeyCode.S, KeyCode.DownArrow);

        public bool ConsumeEnter()
        {
            bool touch = enterButton != null && enterButton.ConsumePress();
            return touch | Pressed(KeyCode.E);
        }

        public bool ConsumeJump()
        {
            bool touch = jumpButton != null && jumpButton.ConsumePress();
            return touch | Pressed(KeyCode.Space);
        }

        /// <summary>Kamera-Wischbewegung in Bildschirm-Pixeln seit dem letzten Aufruf.</summary>
        public Vector2 ConsumeLook()
        {
            Vector2 d = lookArea != null ? lookArea.ConsumeDelta() : Vector2.zero;
            return d + MouseLookDelta() * mouseLookScale;
        }

        /// <summary>Zeigt im Auto Gas/Bremse, zu Fuss den Sprung-Knopf.</summary>
        public void SetDrivingMode(bool isDriving)
        {
            driving = isDriving;
            if (gasButton != null) gasButton.gameObject.SetActive(driving);
            if (brakeButton != null) brakeButton.gameObject.SetActive(driving);
            if (jumpButton != null) jumpButton.gameObject.SetActive(!driving);
        }

        public void SetEnterButton(string text, bool available)
        {
            if (enterButton == null) return;
            enterButton.SetLabel(text);
            enterButton.SetAvailable(available);
        }

        // ---------- Tastatur und Maus (funktioniert mit altem und neuem Input-System) ----------

        Vector2 MouseLookDelta()
        {
#if UNITY_EDITOR || UNITY_STANDALONE
#if ENABLE_INPUT_SYSTEM
            Mouse mouse = Mouse.current;
            if (mouse != null && mouse.rightButton.isPressed) return mouse.delta.ReadValue();
            return Vector2.zero;
#elif ENABLE_LEGACY_INPUT_MANAGER
            if (!Input.GetMouseButton(1)) { mouseLookActive = false; return Vector2.zero; }
            Vector2 pos = Input.mousePosition;
            Vector2 delta = mouseLookActive ? pos - lastMousePosition : Vector2.zero;
            lastMousePosition = pos;
            mouseLookActive = true;
            return delta;
#else
            return Vector2.zero;
#endif
#else
            return Vector2.zero;
#endif
        }

        static bool Held(KeyCode a, KeyCode b)
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard kb = Keyboard.current;
            if (kb != null && (IsKey(kb, a, false) || IsKey(kb, b, false))) return true;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            if (Input.GetKey(a) || Input.GetKey(b)) return true;
#endif
            return false;
        }

        static bool Pressed(KeyCode key)
        {
#if ENABLE_INPUT_SYSTEM
            Keyboard kb = Keyboard.current;
            if (kb != null && IsKey(kb, key, true)) return true;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            if (Input.GetKeyDown(key)) return true;
#endif
            return false;
        }

#if ENABLE_INPUT_SYSTEM
        static bool IsKey(Keyboard kb, KeyCode code, bool thisFrame)
        {
            UnityEngine.InputSystem.Controls.KeyControl k;
            switch (code)
            {
                case KeyCode.W: k = kb.wKey; break;
                case KeyCode.A: k = kb.aKey; break;
                case KeyCode.S: k = kb.sKey; break;
                case KeyCode.D: k = kb.dKey; break;
                case KeyCode.E: k = kb.eKey; break;
                case KeyCode.Space: k = kb.spaceKey; break;
                case KeyCode.UpArrow: k = kb.upArrowKey; break;
                case KeyCode.DownArrow: k = kb.downArrowKey; break;
                case KeyCode.LeftArrow: k = kb.leftArrowKey; break;
                case KeyCode.RightArrow: k = kb.rightArrowKey; break;
                default: return false;
            }
            return thisFrame ? k.wasPressedThisFrame : k.isPressed;
        }
#endif
    }
}
