using UnityEngine;
using UnityEngine.EventSystems;

namespace Muotathal
{
    /// <summary>
    /// Fügt dem EventSystem das richtige Eingabe-Modul hinzu, je nachdem ob im Projekt
    /// das neue Input-System oder der alte Input Manager aktiv ist.
    /// So funktionieren Touch-Knöpfe in beiden Fällen ohne Fehlermeldung.
    /// </summary>
    [RequireComponent(typeof(EventSystem))]
    [DefaultExecutionOrder(-1000)]
    public class EventSystemSetup : MonoBehaviour
    {
        void Awake()
        {
#if ENABLE_INPUT_SYSTEM
            var old = GetComponent<StandaloneInputModule>();
            if (old != null) Destroy(old);
            if (GetComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>() == null)
                gameObject.AddComponent<UnityEngine.InputSystem.UI.InputSystemUIInputModule>();
#else
            if (GetComponent<BaseInputModule>() == null)
                gameObject.AddComponent<StandaloneInputModule>();
#endif
        }
    }
}
