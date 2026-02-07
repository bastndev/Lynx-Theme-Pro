# Lynx Theme Pro Architecture

## Overview

**Lynx Theme Pro** is a comprehensive extension for Visual Studio Code that provides multiple color themes and a custom icon system. The extension is designed to enhance the development experience with visually appealing and eye-friendly themes, along with intuitive `icons` for different file and folder types.

## How it Works

When a user activates the **Lynx Theme Pro** extension in VS Code:

1. The `package.json` file registers the themes and icons through the `contributes` field.
2. Based on user settings or interactions, the **Theme Engine** or **Icon Theme Engine** loads the respective JSON configurations.
3. These configurations are interpreted by the VS Code host and applied to the **User Interface**.
4. Supporting files like icons (SVGs) and documentation provide both visual fidelity and development support.

> 💡 **Note on naming conventions:**  
> Color themes use a prefix (`Lynx-`) followed by a sorting letter (`x`, `y`, `z`) to control display order in the VS Code UI. For example:  
> `Lynx-xGhibli-theme.json`, `Lynx-yCoffee-theme.json`, `Lynx-zKiro-theme.json`.

---

## Architecture Diagram

```mermaid
graph TB
    subgraph "📦 Lynx Theme Pro Extension"
        direction TB
        A[package.json<br/>📋 Main Configuration]

        subgraph "🔧 Core Structure"
            direction TB
            B[Contributes] --> C[themes/<br/>🎨 Themes Dir]
            B --> D[icons/<br/>🎯 Icons Dir]
        end

        subgraph "🎨 Color Themes Collection"
            direction TB
            C --> E[Lynx-Dark-theme.json<br/>🌙 Dark Theme]
            C --> F[Lynx-Light-theme.json<br/>☀️ Light Theme]
            C --> G[Lynx-Night-theme.json<br/>🌃 Night Theme]
            C --> H[Lynx-xGhibli-theme.json<br/>🌸 Ghibli Theme]
            C --> I[Lynx-yCoffee-theme.json<br/>☕ Coffee Theme]
            C --> J[Lynx-zKiro-theme.json<br/>🤖 Kiro Theme]
            C --> K1[Lynx-NVIM-theme.json<br/>⚡ NVIM Theme]
            C --> K2[Lynx-Test-theme.json<br/>🧪 Test Theme]
        end

        subgraph "🎯 Icon System (in icons/)"
            direction TB
            D --> L1[themes-icons/<br/>🎨 Theme Icons]
            D --> L2[material-icons/<br/>📦 Material Icons]

            subgraph "📦 Icon Theme Variants"
                direction LR
                L1 --> M1[lynx-icons-dark.json<br/>🌙 Style A]
                L1 --> M2[lynx-icons-light.json<br/>☀️ Style B]
                L1 --> M3[lynx-icons-gray.json<br/>⚪ Style C]
            end

            subgraph "🎨 Product Icons"
                direction LR
                L2 --> N1[lynx-material-icon.json<br/>📦 Material Design]
                L2 --> N2[lynx-material-icons.woff<br/>🔤 Font File]
            end
        end

        subgraph "🖼️ Assets (in assets/)"
            direction TB
            AS[assets/] --> AI[icons/]
            AS --> AM[images/]
            AS --> ASS[screenshots/]

            subgraph "📂 Icon Assets"
                direction LR
                AI --> AID[dark/]
                AI --> AIL[light/]
                AI --> AIG[gray/]
            end
        end

        subgraph "📚 Documentation & Resources"
            direction LR
            P[README.md<br/>📖 Documentation]
            Q[CONTRIBUTING.md<br/>🤝 Guide]
            S[CHANGELOG.md<br/>📝 History]
        end

        subgraph "🛠️ Build & Release"
            direction LR
            T[CI/CD Pipeline<br/>GitHub Actions]
            U[vsce / Release Process]
        end
    end

    subgraph "🎯 VS Code Integration Layer"
        direction TB
        V[VS Code Extension Host<br/>🏠 Runtime Environment]

        subgraph "⚙️ Engine Systems"
            direction LR
            W[Theme Engine<br/>🎨 Color Processing]
            X[Icon Theme Engine<br/>📁 Icon Processing]
        end

        Y[User Interface<br/>👤 Visual Output]
    end

    A --> B
    A --> T
    T --> U
    U -.-> S
    V -.-> W
    V -.-> X
    W --> Y
    X --> Y

    %% Connect logic
    E -.-> W
    F -.-> W
    M1 -.-> X
    M2 -.-> X
    N1 -.-> X
```
