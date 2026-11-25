using UnityEngine;

namespace Muotathal
{
    /// <summary>
    /// Ein- und Aussteigen: Steht die Figur nahe bei einem Auto, wird der
    /// "Einsteigen"-Knopf aktiv. Im Auto steuert man das Auto statt der Figur.
    /// </summary>
    [RequireComponent(typeof(PlayerController))]
    public class PlayerVehicleSwitcher : MonoBehaviour
    {
        public ThirdPersonCamera followCamera;
        public float enterDistance = 4f;

        PlayerController player;
        CharacterController controller;
        Renderer[] renderers;
        CarController currentCar;

        public bool IsDriving => currentCar != null;

        void Awake()
        {
            player = GetComponent<PlayerController>();
            controller = GetComponent<CharacterController>();
            renderers = GetComponentsInChildren<Renderer>();
        }

        void Update()
        {
            MobileControls input = MobileControls.Instance;
            if (input == null) return;

            CarController nearest = IsDriving ? null : FindNearestCar();
            input.SetEnterButton(IsDriving ? "Aussteigen" : "Einsteigen", IsDriving || nearest != null);

            if (!input.ConsumeEnter()) return;
            if (IsDriving) ExitCar();
            else if (nearest != null) EnterCar(nearest);
        }

        void LateUpdate()
        {
            // Unsichtbar im Auto mitfahren, damit wir beim Aussteigen am richtigen Ort sind
            if (IsDriving) transform.position = currentCar.transform.position;
        }

        CarController FindNearestCar()
        {
            CarController best = null;
            float bestDist = enterDistance;
            foreach (CarController car in CarController.All)
            {
                if (car.HasDriver) continue;
                float d = Vector3.Distance(transform.position, car.transform.position);
                if (d < bestDist) { bestDist = d; best = car; }
            }
            return best;
        }

        void EnterCar(CarController car)
        {
            currentCar = car;
            car.HasDriver = true;
            player.enabled = false;
            controller.enabled = false;
            SetVisible(false);
            if (followCamera != null) followCamera.SetTarget(car.transform, true);
            if (MobileControls.Instance != null) MobileControls.Instance.SetDrivingMode(true);
        }

        void ExitCar()
        {
            CarController car = currentCar;
            currentCar = null;
            car.HasDriver = false;

            Vector3 exit = car.exitPoint != null ? car.exitPoint.position : car.transform.position - car.transform.right * 2f;
            exit.y = car.transform.position.y + 0.1f;
            transform.SetPositionAndRotation(exit, Quaternion.Euler(0f, car.transform.eulerAngles.y, 0f));

            controller.enabled = true;
            player.enabled = true;
            SetVisible(true);
            if (followCamera != null) followCamera.SetTarget(transform, false);
            if (MobileControls.Instance != null) MobileControls.Instance.SetDrivingMode(false);
        }

        void SetVisible(bool visible)
        {
            foreach (Renderer r in renderers) r.enabled = visible;
        }
    }
}
