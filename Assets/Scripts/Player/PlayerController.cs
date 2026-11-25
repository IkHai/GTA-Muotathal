using UnityEngine;

namespace Muotathal
{
    /// <summary>
    /// Spielfigur zu Fuss: läuft in Blickrichtung der Kamera.
    /// Joystick wenig gedrückt = gehen, ganz gedrückt = rennen.
    /// </summary>
    [RequireComponent(typeof(CharacterController))]
    public class PlayerController : MonoBehaviour
    {
        public Transform cameraTransform;
        public float walkSpeed = 2.5f;
        public float runSpeed = 6.5f;
        public float turnSpeed = 720f;   // Grad pro Sekunde
        public float jumpHeight = 1.2f;
        public float gravity = -20f;

        CharacterController controller;
        float verticalVelocity;

        public float CurrentSpeed { get; private set; }

        void Awake()
        {
            controller = GetComponent<CharacterController>();
            if (cameraTransform == null && Camera.main != null) cameraTransform = Camera.main.transform;
        }

        void OnEnable() => verticalVelocity = 0f;

        void Update()
        {
            MobileControls input = MobileControls.Instance;
            Vector2 move = input != null ? input.Move : Vector2.zero;
            float strength = Mathf.Clamp01(move.magnitude);

            // Richtung relativ zur Kamera (nur waagrecht)
            Vector3 forward = Vector3.forward, right = Vector3.right;
            if (cameraTransform != null)
            {
                forward = Vector3.ProjectOnPlane(cameraTransform.forward, Vector3.up).normalized;
                right = Vector3.Cross(Vector3.up, forward);
            }
            Vector3 direction = forward * move.y + right * move.x;
            if (direction.sqrMagnitude > 1f) direction.Normalize();

            // Gehen bis 60 % Joystick, danach bis zum Rennen steigern
            float speed = strength < 0.6f
                ? walkSpeed * (strength / 0.6f)
                : Mathf.Lerp(walkSpeed, runSpeed, (strength - 0.6f) / 0.4f);
            CurrentSpeed = speed;

            if (direction.sqrMagnitude > 0.0001f)
            {
                Quaternion look = Quaternion.LookRotation(direction, Vector3.up);
                transform.rotation = Quaternion.RotateTowards(transform.rotation, look, turnSpeed * Time.deltaTime);
            }

            // Schwerkraft und Springen
            if (controller.isGrounded && verticalVelocity < 0f) verticalVelocity = -2f;
            bool jump = input != null && input.ConsumeJump();
            if (jump && controller.isGrounded) verticalVelocity = Mathf.Sqrt(jumpHeight * -2f * gravity);
            verticalVelocity += gravity * Time.deltaTime;

            Vector3 velocity = direction.normalized * speed + Vector3.up * verticalVelocity;
            controller.Move(velocity * Time.deltaTime);

            // Sicherheitsnetz: aus der Welt gefallen? Zurück nach oben.
            if (transform.position.y < -50f) Teleport(new Vector3(transform.position.x, 5f, transform.position.z));
        }

        public void Teleport(Vector3 position)
        {
            bool was = controller.enabled;
            controller.enabled = false;
            transform.position = position;
            controller.enabled = was;
            verticalVelocity = 0f;
        }
    }
}
