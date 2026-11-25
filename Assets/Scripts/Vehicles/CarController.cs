using System.Collections.Generic;
using UnityEngine;

namespace Muotathal
{
    /// <summary>
    /// Einfaches Arcade-Auto: Gas, Bremse (bzw. Rückwärts) und Lenken mit dem Joystick.
    /// Absichtlich simpel gehalten, damit es auf dem Handy flüssig läuft und leicht zu ändern ist.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class CarController : MonoBehaviour
    {
        public static readonly List<CarController> All = new List<CarController>();

        [Header("Fahren")]
        public float maxSpeed = 22f;          // Meter pro Sekunde (ca. 80 km/h)
        public float maxReverseSpeed = 7f;
        public float acceleration = 9f;
        public float brakeDeceleration = 20f;
        public float rollDeceleration = 4f;   // Ausrollen ohne Gas
        public float turnSpeed = 80f;         // Grad pro Sekunde bei voller Lenkung

        [Header("Teile")]
        public Transform[] wheels;
        public float wheelRadius = 0.35f;
        public Transform exitPoint;

        public bool HasDriver { get; set; }
        public float ForwardSpeed { get; private set; }

        Rigidbody body;

        void Awake()
        {
            body = GetComponent<Rigidbody>();
            body.centerOfMass = new Vector3(0f, 0.3f, 0f);
        }

        void OnEnable() => All.Add(this);
        void OnDisable() => All.Remove(this);

        void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            float speed = Vector3.Dot(body.linearVelocity, transform.forward);

            // Steht das Auto auf dem Boden? (Strahl startet im Auto und trifft daher nicht das eigene Auto)
            bool grounded = Physics.Raycast(body.position + Vector3.up * 0.3f, Vector3.down, 0.6f, ~0, QueryTriggerInteraction.Ignore);
            if (!grounded) { ForwardSpeed = speed; return; }

            MobileControls input = HasDriver ? MobileControls.Instance : null;
            bool gas = input != null && input.Gas;
            bool brake = input != null && input.Brake;
            float steer = input != null ? input.Move.x : 0f;

            if (gas && !brake)
                speed = Mathf.MoveTowards(speed, maxSpeed, acceleration * dt);
            else if (brake && speed > 0.5f)
                speed = Mathf.MoveTowards(speed, 0f, brakeDeceleration * dt);
            else if (brake)
                speed = Mathf.MoveTowards(speed, -maxReverseSpeed, acceleration * 0.6f * dt);
            else
                speed = Mathf.MoveTowards(speed, 0f, (HasDriver ? rollDeceleration : brakeDeceleration) * dt);

            // Lenken wirkt nur, wenn das Auto rollt; rückwärts ist die Lenkung umgekehrt
            float steerFactor = Mathf.Clamp01(Mathf.Abs(speed) / 4f) * Mathf.Sign(speed);
            float yaw = steer * turnSpeed * steerFactor * dt;
            body.MoveRotation(body.rotation * Quaternion.Euler(0f, yaw, 0f));

            // Seitliches Rutschen entfernen, Fallen (y) beibehalten
            Vector3 forward = Quaternion.Euler(0f, yaw, 0f) * transform.forward;
            body.linearVelocity = forward * speed + Vector3.up * body.linearVelocity.y;
            ForwardSpeed = speed;
        }

        void Update()
        {
            // Räder optisch drehen
            if (wheels == null || wheelRadius <= 0f) return;
            float degrees = ForwardSpeed / wheelRadius * Mathf.Rad2Deg * Time.deltaTime;
            foreach (Transform w in wheels)
                if (w != null) w.Rotate(Vector3.up, degrees, Space.Self);
        }
    }
}
