# Deploy no Rancher

## 1. Build da imagem

```powershell
cd C:\Fontes\Extracao222
docker build -t REGISTRY/PROJETO/ecargo-analytics:VERSAO .
docker push REGISTRY/PROJETO/ecargo-analytics:VERSAO
```

Substitua `REGISTRY/PROJETO` pelo registry usado pelo cluster Rancher.

## 2. Ajustes antes de aplicar

No arquivo `deploy/ecargo-analytics.yaml`:

- use uma tag imutável da imagem publicada, por exemplo o SHA do commit. O cluster bloqueia `latest`;
- troque o host `ecargo-analytics.loginlogistica.com.br` pelo DNS desejado;
- cadastre `ECARGO_222_USER` e `ECARGO_222_PASSWORD` como Secret no Rancher.

## 3. Aplicar pelo Rancher

No Rancher:

1. Escolha o cluster/projeto correto.
2. Importe o YAML em `Apps` ou `Workloads`.
3. Confirme namespace, image, service e ingress.
4. Valide se o pod ficou `Running`.

## Observação

A busca direta no 222 usa a API operacional antiga e pode retornar menos chamados que o Excel exportado. Para números gerenciais, mantenha o upload do Excel como fonte confiável até a integração com a API nova ou com o endpoint de exportação oficial.
