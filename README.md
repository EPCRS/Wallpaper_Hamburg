# Hamburg Rain System HUD — Wallpaper Engine Web Wallpaper

Pacote web Full HD 16:9 com HUD em tons de cinza, relógio local, dois relógios mundiais configuráveis, gráficos de CPU/GPU, RAM/VRAM e temperaturas.

## Instalação no Wallpaper Engine

1. Extraia a pasta `hamburg_system_hud_wallpaper`.
2. No Wallpaper Engine, clique em **Create Wallpaper** / **Criar Wallpaper**.
3. Importe o arquivo `index.html` desta pasta.
4. Nas opções do wallpaper, configure:
   - `Demo mode / fallback`: deixe `true` para testar sem sensores reais; coloque `false` para usar a API local.
   - `Local sensor API URL`: padrão `http://127.0.0.1:17377/stats`.
   - Fusos horários: use nomes IANA como `Europe/Berlin`, `America/Sao_Paulo`, `America/New_York`, `Asia/Tokyo`.

## Sensores em tempo real

Browsers e wallpapers web não conseguem ler CPU/GPU/temperaturas diretamente por segurança. Este pacote inclui uma ponte local opcional em `sensor-bridge/`.

### Opção recomendada: Node.js

1. Instale Node.js.
2. Entre em `sensor-bridge/`.
3. Execute `start-bridge.bat` no Windows ou rode manualmente:

```bash
npm install
npm start
```

Depois acesse `http://127.0.0.1:17377/stats`. Se retornar JSON, desative `Demo mode / fallback` no Wallpaper Engine.

### Alternativa: PowerShell

Rode `sensor-bridge-powershell.ps1`. Ela lê CPU/RAM nativamente e GPU/VRAM/temperatura GPU se `nvidia-smi` estiver disponível. CPU e motherboard temperature podem aparecer nulos sem HWiNFO/LibreHardwareMonitor.

## Observações

- Temperaturas de CPU e placa-mãe no Windows dependem muito do hardware, driver e permissões.
- O wallpaper continua funcionando em modo demo quando a API local não estiver ativa.
- O fundo padrão está em `assets/hamburg-rain-hud-bg.png` e também pode ser trocado nas propriedades.
