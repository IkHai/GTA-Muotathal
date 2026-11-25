using UnityEngine;

namespace Muotathal
{
    /// <summary>
    /// Grundeinstellungen beim Spielstart: feste 30 Bilder pro Sekunde,
    /// Bildschirm bleibt an, Querformat.
    /// </summary>
    public class GameBootstrap : MonoBehaviour
    {
        [Tooltip("Ziel-Bildrate. 30 ist auf den meisten Handys stabil und schont den Akku.")]
        public int targetFrameRate = 30;

        void Awake()
        {
            QualitySettings.vSyncCount = 0; // sonst ignoriert das Handy targetFrameRate
            Application.targetFrameRate = targetFrameRate;
            Screen.sleepTimeout = SleepTimeout.NeverSleep;
            Screen.orientation = ScreenOrientation.AutoRotation;
            Screen.autorotateToPortrait = false;
            Screen.autorotateToPortraitUpsideDown = false;
            Screen.autorotateToLandscapeLeft = true;
            Screen.autorotateToLandscapeRight = true;
        }
    }
}
