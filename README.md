# Village Plaquinhas

Cole a lista do cardápio (até direto do WhatsApp) e gere o PDF das plaquinhas de buffet —
8 por folha A4, mesmo padrão visual do Village Resort. Tudo roda no navegador, sem
servidor: um parser heurístico interpreta bullets, saudação solta, linhas de chat e
instruções como "2 de cada", e o PDF é montado com `pdf-lib` usando a mesma fonte
(Montserrat Bold) e grade do gerador original.

Uso: cole o texto → "Interpretar lista" → confira/ajuste os itens → "Gerar PDF".
