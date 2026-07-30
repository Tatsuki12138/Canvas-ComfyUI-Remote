package local.canvas.comfy;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(CanvasMediaPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
