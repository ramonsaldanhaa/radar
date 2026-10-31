# Radar

Captação de leads em evento da Trevi: meta ao vivo no radar, agenda de reuniões, funil e integração com o Google Sheets.

O app é estático, sem build. Cada lead é salvo primeiro no aparelho e sobe para a planilha assim que houver conexão.

## Rodar localmente

```bash
python3 -m http.server 8770
```

Depois abra `http://localhost:8770`.

## Ajustar o evento

Tudo fica em [`config.js`](config.js): meta, serviços, tipos de interessado e etapas do funil.
Se mudar tipos ou etapas, atualize também `TIPOS` e `ETAPAS` no [`apps-script.gs`](apps-script.gs).

## Ligar no Google Sheets

1. Crie uma planilha e abra Extensões → Apps Script.
2. Cole o conteúdo de `apps-script.gs` e troque `CODIGO` por uma senha sua, com 12 caracteres ou mais.
3. Vá em Implantar → Nova implantação → App da Web. Use "Executar como: Eu" e "Quem pode acessar: Qualquer pessoa".
4. No Radar, toque no status do topo e cole a URL que termina em `/exec` e o código. Repita em cada aparelho.

O código não fica neste repositório. Sem ele, ninguém lê nem grava os leads pela URL do script.

## Publicar

No Vercel, importe este repositório e use o preset "Other", sem comando de build.

## Estrutura

| Arquivo | Papel |
|---|---|
| `index.html` | Estrutura das telas |
| `styles.css` | Identidade Trevi 5.0 |
| `app.js` | Cadastro, filtros, agenda e sincronização |
| `radar.js` | O instrumento animado |
| `config.js` | Ajustes do evento |
| `apps-script.gs` | Recebe os leads na planilha. Não é publicado no site |
