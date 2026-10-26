// ============================================================================
// PROJECT: TECNOX — AI DOWNFALL
// FIRMWARE: ESP32 Hardware Shooting Trigger Button
// ============================================================================
// Hardware Specifications:
// - Board: ESP32 NodeMCU / ESP-WROOM-32
// - Trigger Input: GPIO 4 with internal pull-up (INPUT_PULLUP)
// - Physical Button: Connected between GPIO 4 and GND
// - Access Point SSID: "ESP32-Trigger"
// - Wi-Fi Password: "Trigger123" (configurable via ESP32_AP_PASSWORD build flag)
// - HTTP Server: Port 80
// - WebSocket Server: Port 81
// - Debounce Window: 40 ms
// - Shot Cooldown: 400 ms
// - Transmitted Payload: "SHOOT" (plain text)
// ============================================================================

#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>

const int TRIGGER_PIN = 4;

const char* AP_SSID = "ESP32-Trigger";
#ifndef ESP32_AP_PASSWORD
#define ESP32_AP_PASSWORD "Trigger123"
#endif
const char* AP_PASSWORD = ESP32_AP_PASSWORD;

WebServer httpServer(80);
WebSocketsServer webSocket(81);

int lastReading = HIGH;
int stableState = HIGH;
unsigned long lastDebounce = 0;
unsigned long lastShotTime = 0;

const unsigned long DEBOUNCE_MS = 40;
const unsigned long COOLDOWN_MS = 400;

void onWebSocketEvent(uint8_t clientNum,
                      WStype_t type,
                      uint8_t * payload,
                      size_t length) {
  switch (type) {
    case WStype_CONNECTED: {
      IPAddress ip = webSocket.remoteIP(clientNum);
      Serial.printf("[WebSocket] Client #%u connected from %d.%d.%d.%d\n", clientNum, ip[0], ip[1], ip[2], ip[3]);
      break;
    }
    case WStype_DISCONNECTED: {
      Serial.printf("[WebSocket] Client #%u disconnected\n", clientNum);
      break;
    }
    case WStype_TEXT: {
      // Diagnostic telemetry or heartbeat (if sent by client)
      Serial.printf("[WebSocket] Client #%u message: %s\n", clientNum, payload);
      break;
    }
    case WStype_ERROR: {
      Serial.printf("[WebSocket] Client #%u error\n", clientNum);
      break;
    }
    default:
      break;
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);

  // Configure trigger pin with internal pullup (Active LOW when pressed)
  pinMode(TRIGGER_PIN, INPUT_PULLUP);

  // Launch Wi-Fi Soft Access Point
  WiFi.mode(WIFI_AP);
  WiFi.softAP(AP_SSID, AP_PASSWORD);

  Serial.println("\n==========================================");
  Serial.println("     TECNOX — AI DOWNFALL ESP32 ONLINE    ");
  Serial.println("==========================================");
  Serial.print("Wi-Fi SSID:     ");
  Serial.println(AP_SSID);
  Serial.print("Wi-Fi Password: ");
  Serial.println(AP_PASSWORD);
  Serial.print("ESP32 IP:       ");
  Serial.println(WiFi.softAPIP());
  Serial.println("HTTP Server:    Port 80");
  Serial.println("WebSocket:      Port 81 (ws://192.168.4.1:81/)");
  Serial.println("Trigger Input:  GPIO 4 (Active LOW, Button to GND)");
  Serial.println("==========================================\n");

  // HTTP root endpoint for browser check
  httpServer.on("/", []() {
    httpServer.send(200, "text/plain",
      "TECNOX — AI DOWNFALL ESP32 Trigger is online.\n"
      "SSID: ESP32-Trigger\n"
      "WebSocket Endpoint: ws://192.168.4.1:81/\n"
      "GPIO Pin: 4 (Active LOW)\n"
    );
  });

  httpServer.begin();

  // WebSocket Server on Port 81
  webSocket.begin();
  webSocket.onEvent(onWebSocketEvent);

  Serial.println("System ready. Waiting for game station connection...");
}

void loop() {
  httpServer.handleClient();
  webSocket.loop();

  // Read trigger input state
  int reading = digitalRead(TRIGGER_PIN);

  // Debounce filter logic (40ms)
  if (reading != lastReading) {
    lastReading = reading;
    lastDebounce = millis();
  }

  if (millis() - lastDebounce >= DEBOUNCE_MS) {
    if (reading != stableState) {
      stableState = reading;

      // Trigger pressed: Active LOW
      if (stableState == LOW) {
        unsigned long now = millis();

        // 400ms shot cooldown
        if (lastShotTime == 0 || now - lastShotTime >= COOLDOWN_MS) {
          // Broadcast plaintext SHOOT event to all connected game station clients
          webSocket.broadcastTXT("SHOOT");
          Serial.println("[TRIGGER] >>> SHOOT broadcasted over WebSocket");
          lastShotTime = now;
        } else {
          Serial.printf("[TRIGGER] Cooldown active (%lums remaining)\n", COOLDOWN_MS - (now - lastShotTime));
        }
      }
    }
  }
}
