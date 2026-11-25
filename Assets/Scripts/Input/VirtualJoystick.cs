using UnityEngine;
using UnityEngine.EventSystems;

namespace Muotathal
{
    /// <summary>
    /// Virtueller Joystick für die linke Bildschirmhälfte.
    /// Wo der Daumen den Bildschirm berührt, erscheint der Joystick (dynamischer Joystick).
    /// Liefert einen Wert von (-1,-1) bis (1,1).
    /// </summary>
    public class VirtualJoystick : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        [Tooltip("Der runde Hintergrund des Joysticks")]
        public RectTransform background;
        [Tooltip("Der Knopf, der mit dem Daumen bewegt wird")]
        public RectTransform handle;
        [Tooltip("Wie weit der Knopf sich bewegen darf (in UI-Pixeln)")]
        public float radius = 110f;
        [Tooltip("Kleine Bewegungen darunter werden ignoriert")]
        [Range(0f, 0.5f)] public float deadZone = 0.1f;

        public Vector2 Value { get; private set; }

        RectTransform area;
        Vector2 restPosition;
        int pointerId = int.MinValue;

        void Awake()
        {
            area = (RectTransform)transform;
            if (background != null) restPosition = background.anchoredPosition;
        }

        public void OnPointerDown(PointerEventData eventData)
        {
            if (pointerId != int.MinValue) return; // schon ein anderer Finger aktiv
            pointerId = eventData.pointerId;
            if (background != null && ToLocal(eventData, out Vector2 local))
                background.anchoredPosition = local;
            OnDrag(eventData);
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId != pointerId || background == null) return;
            if (!ToLocal(eventData, out Vector2 local)) return;

            Vector2 offset = local - background.anchoredPosition;
            Vector2 v = Vector2.ClampMagnitude(offset / radius, 1f);
            if (handle != null) handle.anchoredPosition = v * radius;

            // Totzone herausrechnen, damit kleines Zittern nicht bewegt
            float m = v.magnitude;
            Value = m < deadZone ? Vector2.zero : v.normalized * Mathf.InverseLerp(deadZone, 1f, m);
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId != pointerId) return;
            ResetStick();
        }

        void OnDisable() => ResetStick();

        void ResetStick()
        {
            pointerId = int.MinValue;
            Value = Vector2.zero;
            if (handle != null) handle.anchoredPosition = Vector2.zero;
            if (background != null) background.anchoredPosition = restPosition;
        }

        bool ToLocal(PointerEventData e, out Vector2 local)
        {
            // Position relativ zur linken unteren Ecke des Bereichs (Pivot 0,0)
            return RectTransformUtility.ScreenPointToLocalPointInRectangle(area, e.position, e.pressEventCamera, out local);
        }
    }
}
