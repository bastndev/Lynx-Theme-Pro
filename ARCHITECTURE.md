# Lynx Theme Pro Architecture

## Overview

**Lynx Theme Pro** is a comprehensive extension for Visual Studio Code that provides multiple color themes and a custom icon system. The extension is designed to enhance the development experience with visually appealing and eye-friendly themes, along with intuitive icons for different file and folder types.

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
        A[package.json<br/>📋 Main Configuration] --> B[Contributes]
        
        B --> C[🎨 Themes]
        B --> D[🎯 Icon Themes]
        
        subgraph "🎨 Color Themes"
            C --> E[[Lynx-Dark-theme.json<br/>🌙 Dark Theme]]
            C --> F[[Lynx-Light-theme.json<br/>☀️ Light Theme]]
            C --> G[[Lynx-Night-theme.json<br/>🌃 Night Theme]]
            C --> H[[Lynx-xGhibli-theme.json<br/>🌸 Ghibli Theme]]
            C --> I[[Lynx-yCoffee-theme.json<br/>☕ Coffee Theme]]
            C --> J[[Lynx-zKiro-theme.json<br/>🤖 Kiro Theme]]
        end
        
        subgraph "🎯 Icon System"
            D --> K[[lynx-icons.json<br/>📁 Icon Configuration]]
            K --> L[[assets/icons/<br/>🎨 SVG Collection]]
            
            L --> M[📄 File Icons<br/>500+ file icons]
            L --> N[📁 Folder Icons<br/>100+ folder icons]
            L --> O[🔧 Special Icons<br/>Specialized icons]
        end
        
        subgraph "📚 Documentation & Assets"
            P[[README.md<br/>📖 Documentation]]
            Q[[CONTRIBUTING.md<br/>🤝 Contribution Guide]]
            R[[assets/images/<br/>🖼️ Visual Resources]]
            S[[CHANGELOG.md<br/>📝 Change History]]
        end
    end
    
    subgraph "🎯 VS Code Integration"
        T[VS Code Extension Host]
        U[Theme Engine]
        V[Icon Theme Engine]
        W[User Interface]
    end
    
    A --> T
    E --> U
    F --> U
    G --> U
    H --> U
    I --> U
    J --> U
    K --> V
    U --> W
    V --> W
    
    style A fill:#ff6b6b,stroke:#333,stroke-width:2px,color:#fff
    style C fill:#4ecdc4,stroke:#333,stroke-width:2px,color:#fff
    style D fill:#45b7d1,stroke:#333,stroke-width:2px,color:#fff
    style K fill:#96ceb4,stroke:#333,stroke-width:2px,color:#fff
    style W fill:#feca57,stroke:#333,stroke-width:2px,color:#000
