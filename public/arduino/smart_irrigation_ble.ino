/*
 * Smart Irrigation System - ESP32 with BLE
 * Streams sensor readings as JSON over a BLE Notify characteristic.
 * Pair from a Web Bluetooth dashboard (Chrome/Edge) to view live data.
 *
 * BLE Service UUID:        12345678-1234-5678-1234-56789abcdef0
 * BLE Characteristic UUID: 12345678-1234-5678-1234-56789abcdef1
 */

#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>

#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// ---------- BLE ----------
#define SERVICE_UUID        "12345678-1234-5678-1234-56789abcdef0"
#define CHARACTERISTIC_UUID "12345678-1234-5678-1234-56789abcdef1"

BLECharacteristic *pCharacteristic;
bool deviceConnected = false;

class ServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer* pServer) { deviceConnected = true; }
  void onDisconnect(BLEServer* pServer) {
    deviceConnected = false;
    BLEDevice::startAdvertising(); // keep advertising after disconnect
  }
};

// ---------- Sensors ----------
LiquidCrystal_I2C lcd(0x27, 16, 2);

#define DHTPIN 15
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);

#define ONE_WIRE_BUS 4
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature sensors(&oneWire);

#define SOIL_MOISTURE_PIN 34
#define PH_SENSOR_PIN     35
#define RAIN_SENSOR_PIN   32
#define PUMP_RELAY_PIN    18

const int dryValue = 3000;
const int wetValue = 1200;
const int SOIL_MOISTURE_THRESHOLD = 40;

void setup() {
  Serial.begin(115200);

  lcd.init();
  lcd.backlight();
  lcd.print("Smart Irrigation");
  lcd.setCursor(0, 1);
  lcd.print("BLE Starting...");

  dht.begin();
  sensors.begin();
  pinMode(PUMP_RELAY_PIN, OUTPUT);
  digitalWrite(PUMP_RELAY_PIN, HIGH);

  // ---- BLE init ----
  BLEDevice::init("SmartIrrigation-ESP32");
  BLEServer *pServer = BLEDevice::createServer();
  pServer->setCallbacks(new ServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);
  pCharacteristic = pService->createCharacteristic(
    CHARACTERISTIC_UUID,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY
  );
  pCharacteristic->addDescriptor(new BLE2902());
  pService->start();

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  BLEDevice::startAdvertising();

  Serial.println("BLE advertising as 'SmartIrrigation-ESP32'");
  delay(1500);
  lcd.clear();
}

void loop() {
  // ---- Read sensors ----
  float h = dht.readHumidity();
  float t = dht.readTemperature();
  if (isnan(h)) h = 0;
  if (isnan(t)) t = 0;

  sensors.requestTemperatures();
  float waterTemp = sensors.getTempCByIndex(0);
  if (waterTemp == DEVICE_DISCONNECTED_C) waterTemp = 0;

  int soilMoistureAnalog = analogRead(SOIL_MOISTURE_PIN);
  int soilMoisturePercent = map(soilMoistureAnalog, dryValue, wetValue, 0, 100);
  soilMoisturePercent = constrain(soilMoisturePercent, 0, 100);

  int phAnalog = analogRead(PH_SENSOR_PIN);
  float voltage = phAnalog * (3.3 / 4095.0);
  // Simple pH approximation - replace with your calibration
  float ph = 7.0 + ((2.5 - voltage) / 0.18);

  int rainAnalog = analogRead(RAIN_SENSOR_PIN);
  bool isRaining = (rainAnalog < 2000);

  // ---- Irrigation logic ----
  bool pumpOn = false;
  if (soilMoisturePercent < SOIL_MOISTURE_THRESHOLD && !isRaining) {
    digitalWrite(PUMP_RELAY_PIN, LOW);
    pumpOn = true;
  } else {
    digitalWrite(PUMP_RELAY_PIN, HIGH);
  }

  // ---- LCD ----
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print("SM:"); lcd.print(soilMoisturePercent);
  lcd.print("% T:"); lcd.print(t, 1); lcd.print((char)223); lcd.print("C");
  lcd.setCursor(0, 1);
  lcd.print("pH:"); lcd.print(ph, 1);
  lcd.print(" R:"); lcd.print(isRaining ? "Y" : "N");

  // ---- Send JSON via BLE ----
  char payload[180];
  snprintf(payload, sizeof(payload),
    "{\"t\":%.1f,\"h\":%.1f,\"wt\":%.1f,\"sm\":%d,\"ph\":%.2f,\"rain\":%d,\"pump\":%d}",
    t, h, waterTemp, soilMoisturePercent, ph, isRaining ? 1 : 0, pumpOn ? 1 : 0
  );
  Serial.println(payload);

  if (deviceConnected) {
    pCharacteristic->setValue((uint8_t*)payload, strlen(payload));
    pCharacteristic->notify();
  }

  delay(2000);
}