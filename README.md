# Air Quality Monitoring App

An application for reading air quality data from SDS011/SDS021 particulate matter sensors via USB serial connection.

## Recent Code Improvements

We've significantly improved the codebase through several key changes:

### 1. Simplified and Organized Sensor Utilities (`sensorUtils.ts`)

- **Organized by Functionality**: Grouped related functions into logical namespaces:
  - `ByteUtils`: Hex/decimal conversion utilities
  - `SensorPacket`: Packet handling and parsing functions
  - `SensorCommands`: Command generation
  - `AirQualityIndex`: Air quality categorization

- **Removed Debug Code**: Eliminated excessive console.log statements to improve readability and performance

- **Better Structure**: Improved organization makes the code more maintainable and easier to understand

### 2. Enhanced USB Serial Hook (`useUsbSerial.ts`)

- **Consolidated State Management**: 
  - Combined related state variables into structured objects
  - Better organization of connection state, config options, and timers

- **Improved Type Safety**:
  - Added proper TypeScript interfaces for all data structures
  - Fixed issues with dynamic function references

- **Reliable Connection Handling**:
  - Better handling of device attachment/detachment
  - More robust error recovery mechanisms

### 3. Simplified Sensor Data Processing (`useSensorData.ts` and `SensorData.tsx`)

- **Updated to Use New Utilities**:
  - Leveraging the restructured utility functions
  - Type-safe access to style properties

- **Reduced Code Duplication**:
  - Eliminated redundant conversion code
  - Centralized sensor data processing logic

### Benefits of These Changes

- **More maintainable code**: Better organization makes the code easier to understand and modify
- **Reduced duplication**: Common functions are defined once and reused
- **Improved reliability**: More robust error handling and device connection management
- **Better type safety**: Proper TypeScript typing throughout the codebase

## Usage

Connect your SDS011/SDS021 sensor to your Android device via USB (requires OTG support). The app will automatically detect and connect to the sensor and begin displaying air quality measurements.

- **PM2.5**: Fine particulate matter (2.5 micrometers or smaller)
- **PM10**: Coarse particulate matter (10 micrometers or smaller)

The readings are color-coded according to standard air quality categories from Good (green) to Hazardous (dark pink).

## Features

- Connect to SDS011/SDS021 particulate matter sensors via USB
- Real-time monitoring of PM2.5 and PM10 air quality data
- Running averages of air quality measurements
- Device discovery and connection management
- Logs with user-friendly and developer modes
- Cross-platform support for Android and iOS

## Development

### Prerequisites

- Node.js (v18 or higher)
- React Native CLI
- Android Studio or Xcode (depending on target platform)
- SDS011 or SDS021 PM sensor (for testing)

### Getting Started

1. Install dependencies:
   ```sh
   npm install
   ```

2. Start the Metro server:
   ```sh
   npm start
   ```

3. Run the app:
   ```sh
   # For Android
   npm run android
   
   # For iOS
   npm run ios
   ```

## Building Release Versions

### Environment Setup

1. Make sure you have a keystore file in `android/app/my-release-key.keystore`
   - If you need to generate a keystore, run:
     ```sh
     keytool -genkeypair -v -storetype PKCS12 -keystore my-release-key.keystore -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
     ```
   - Then move the generated file to `android/app/`
   - **Important**: The key alias must be exactly `my-key-alias` as configured in the app's build.gradle

2. Create a `.env` file in the project root with your keystore passwords:
   ```
   ANDROID_STORE_PASSWORD=your-store-password
   ANDROID_KEY_PASSWORD=your-key-password
   ```

### Android Release Build

Run the following command to build a signed APK:
```sh
npm run build-android-release
```

The generated APK will be located at `android/app/build/outputs/apk/release/app-release.apk`

### iOS Release Build

To build for iOS in release configuration:
```sh
npm run build-ios-release
```

### Combined Build

To build for both platforms:
```sh
npm run build-release
```

## Automated Builds with GitHub Actions

This project includes a GitHub Actions workflow that automatically builds and publishes Android APKs when a new version tag is pushed.

### Setup

1. Add the following secrets to your GitHub repository:
   - `KEYSTORE_BASE64`: Your base64-encoded keystore file
   - `ANDROID_STORE_PASSWORD`: The password for your keystore
   - `ANDROID_KEY_PASSWORD`: The password for your key alias

2. Convert your keystore to base64:
   ```sh
   # On Linux/macOS
   base64 -i my-release-key.keystore

   # On Windows PowerShell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("my-release-key.keystore"))
   ```

3. Push a version tag to trigger a build:
   ```sh
   git tag v1.0.0
   git push origin v1.0.0
   ```

The workflow will:
1. Build the APK with release signing
2. Create a GitHub release for the tag
3. Attach the APK to the release

## Building Android Release with Environment Variables

### Using .env file (recommended for local development)

1. Create a `.env` file in the project root with your keystore passwords:
   ```
   ANDROID_STORE_PASSWORD=your_store_password
   ANDROID_KEY_PASSWORD=your_key_password
   ```

2. Make sure your keystore file is placed at `android/app/my-release-key.keystore`

3. Run the build command with environment variables loaded from .env:
   ```
   npm run build-android-release-env
   ```

### Alternative methods

You can also provide environment variables directly:

```bash
# Windows PowerShell
$env:ANDROID_STORE_PASSWORD="your_password"
$env:ANDROID_KEY_PASSWORD="your_password"
npm run build-android-release

# Windows CMD
set ANDROID_STORE_PASSWORD=your_password
set ANDROID_KEY_PASSWORD=your_password
npm run build-android-release

# Linux/macOS
ANDROID_STORE_PASSWORD=your_password ANDROID_KEY_PASSWORD=your_password npm run build-android-release
```
