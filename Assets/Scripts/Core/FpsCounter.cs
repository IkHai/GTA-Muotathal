using UnityEngine;
using UnityEngine.UI;

namespace Muotathal
{
    /// <summary>Zeigt oben links die aktuelle Bildrate (FPS) an.</summary>
    public class FpsCounter : MonoBehaviour
    {
        public Text label;
        float timer;
        int frames;

        void Update()
        {
            frames++;
            timer += Time.unscaledDeltaTime;
            if (timer >= 0.5f)
            {
                if (label != null) label.text = Mathf.RoundToInt(frames / timer) + " FPS";
                frames = 0;
                timer = 0f;
            }
        }
    }
}
