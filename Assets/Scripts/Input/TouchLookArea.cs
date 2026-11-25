using UnityEngine;
using UnityEngine.EventSystems;

namespace Muotathal
{
    /// <summary>
    /// Unsichtbare Fläche auf der rechten Bildschirmhälfte.
    /// Wischen dreht die Kamera.
    /// </summary>
    public class TouchLookArea : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
    {
        int pointerId = int.MinValue;
        Vector2 accumulated;

        public void OnPointerDown(PointerEventData eventData)
        {
            if (pointerId == int.MinValue) pointerId = eventData.pointerId;
        }

        public void OnDrag(PointerEventData eventData)
        {
            if (eventData.pointerId == pointerId) accumulated += eventData.delta;
        }

        public void OnPointerUp(PointerEventData eventData)
        {
            if (eventData.pointerId == pointerId) pointerId = int.MinValue;
        }

        void OnDisable()
        {
            pointerId = int.MinValue;
            accumulated = Vector2.zero;
        }

        /// <summary>Gibt die Wisch-Bewegung (in Bildschirm-Pixeln) seit dem letzten Aufruf zurück.</summary>
        public Vector2 ConsumeDelta()
        {
            Vector2 d = accumulated;
            accumulated = Vector2.zero;
            return d;
        }
    }
}
