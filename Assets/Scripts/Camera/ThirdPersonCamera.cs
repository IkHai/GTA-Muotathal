using UnityEngine;

namespace Muotathal
{
    /// <summary>
    /// Kamera hinter der Spielfigur (oder dem Auto). Wischen rechts dreht sie.
    /// Wände und Berge schieben die Kamera näher heran, damit sie nicht hindurchschaut.
    /// </summary>
    public class ThirdPersonCamera : MonoBehaviour
    {
        public Transform target;

        [Header("Zu Fuss")]
        public float walkDistance = 4.5f;
        public float walkHeight = 1.6f;

        [Header("Im Auto")]
        public float carDistance = 8f;
        public float carHeight = 1.8f;
        [Tooltip("Nach so vielen Sekunden ohne Wischen dreht die Kamera wieder hinter das Auto")]
        public float autoAlignDelay = 1.2f;

        [Header("Steuerung")]
        [Tooltip("Grad Drehung, wenn man einmal über die ganze Bildschirmhöhe wischt")]
        public float sensitivity = 200f;
        public float minPitch = -25f;
        public float maxPitch = 70f;
        public float collisionRadius = 0.25f;

        float yaw;
        float pitch = 15f;
        float distance;
        float currentDistance;
        float height;
        bool followingCar;
        float timeSinceLook;
        readonly RaycastHit[] hits = new RaycastHit[16];

        void Start()
        {
            if (target != null) yaw = target.eulerAngles.y;
            SetTarget(target, false);
            currentDistance = distance;
        }

        public void SetTarget(Transform newTarget, bool isCar)
        {
            target = newTarget;
            followingCar = isCar;
            distance = isCar ? carDistance : walkDistance;
            height = isCar ? carHeight : walkHeight;
            timeSinceLook = autoAlignDelay; // im Auto sofort hinter das Auto drehen
        }

        void LateUpdate()
        {
            if (target == null) return;
            float dt = Time.deltaTime;

            Vector2 look = MobileControls.Instance != null ? MobileControls.Instance.ConsumeLook() : Vector2.zero;
            float scale = sensitivity / Mathf.Max(1f, Screen.height);
            if (look.sqrMagnitude > 0.01f) timeSinceLook = 0f; else timeSinceLook += dt;
            yaw += look.x * scale;
            pitch = Mathf.Clamp(pitch - look.y * scale, minPitch, maxPitch);

            if (followingCar && timeSinceLook > autoAlignDelay)
            {
                yaw = Mathf.LerpAngle(yaw, target.eulerAngles.y, dt * 2.5f);
                pitch = Mathf.Lerp(pitch, 12f, dt * 2f);
            }

            Quaternion rotation = Quaternion.Euler(pitch, yaw, 0f);
            Vector3 focus = target.position + Vector3.up * height;
            Vector3 back = rotation * Vector3.back;

            // Hindernisse zwischen Figur und Kamera finden (die Figur/das Auto selbst ignorieren)
            float wanted = distance;
            int count = Physics.SphereCastNonAlloc(focus, collisionRadius, back, hits, distance, ~0, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < count; i++)
            {
                if (hits[i].transform.IsChildOf(target)) continue;
                if (hits[i].distance <= 0f) continue;
                wanted = Mathf.Min(wanted, hits[i].distance);
            }

            // Schnell heranzoomen, langsam wieder weg
            float speed = wanted < currentDistance ? 20f : 4f;
            currentDistance = Mathf.Lerp(currentDistance, wanted, 1f - Mathf.Exp(-speed * dt));

            transform.SetPositionAndRotation(focus + back * currentDistance, rotation);
        }
    }
}
