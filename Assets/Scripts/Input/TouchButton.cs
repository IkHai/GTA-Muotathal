using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Muotathal
{
    /// <summary>
    /// Ein Knopf auf dem Bildschirm, der gedrückt gehalten werden kann (z.B. Gas)
    /// oder einmal angetippt wird (z.B. Einsteigen).
    /// </summary>
    public class TouchButton : MonoBehaviour, IPointerDownHandler, IPointerUpHandler
    {
        public Image image;
        public Text label;
        public Color normalColor = new Color(1f, 1f, 1f, 0.35f);
        public Color pressedColor = new Color(1f, 1f, 1f, 0.7f);

        public bool IsHeld => pressCount > 0;

        int pressCount;
        int pressedFrame = -100;
        bool pressConsumed = true;
        bool available = true;

        void Awake() => UpdateColor();

        public void OnPointerDown(PointerEventData eventData)
        {
            pressCount++;
            pressedFrame = Time.frameCount;
            pressConsumed = false;
            UpdateColor();
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            pressCount = Mathf.Max(0, pressCount - 1);
            UpdateColor();
        }

        void OnDisable()
        {
            pressCount = 0;
            pressConsumed = true;
            UpdateColor();
        }

        /// <summary>
        /// True genau einmal pro Antippen. Alte Klicks (älter als 1 Bild) verfallen,
        /// damit nichts "verspätet" ausgelöst wird.
        /// </summary>
        public bool ConsumePress()
        {
            if (pressConsumed || Time.frameCount - pressedFrame > 1) return false;
            pressConsumed = true;
            return true;
        }

        public void SetLabel(string text)
        {
            if (label != null && label.text != text) label.text = text;
        }

        /// <summary>Knopf halb durchsichtig zeigen, wenn er gerade nichts bewirkt.</summary>
        public void SetAvailable(bool value)
        {
            if (available == value) return;
            available = value;
            UpdateColor();
        }

        void UpdateColor()
        {
            if (image == null) return;
            Color c = IsHeld ? pressedColor : normalColor;
            if (!available) c.a *= 0.4f;
            image.color = c;
        }
    }
}
