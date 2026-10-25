package net.a2f0.ct;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PasswordManagerPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
