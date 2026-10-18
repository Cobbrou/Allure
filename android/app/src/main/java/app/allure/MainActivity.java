package app.allure;

import android.os.Bundle;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins are registered before the bridge starts.
        registerPlugin(RestingHrPlugin.class);
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);
    }
}
