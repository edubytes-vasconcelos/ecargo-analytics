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

## Configuração que funcionou no Rancher

URL publicada:

```text
https://ecargohml.k8s.loginlogistica.com.br/ecargo-analytics
```

Deployment:

```text
HOST=0.0.0.0
PORT=8765
BASE_PATH=/ecargo-analytics
```

Ingress:

```yaml
spec:
  ingressClassName: kong
  rules:
    - host: ecargohml.k8s.loginlogistica.com.br
      http:
        paths:
          - path: /ecargo-analytics
            pathType: Prefix
            backend:
              service:
                name: ecargo-analytics
                port:
                  number: 80
  tls:
    - hosts:
        - ecargohml.k8s.loginlogistica.com.br
      secretName: lets-login
```

Observações:

- O Service fica `80 -> 8765`.
- O cluster bloqueia imagem com tag `latest`; use tag imutável com SHA do commit.
- O package no GHCR precisa estar público, ou o Deployment precisa de `imagePullSecret`.
- A base acumulada fica em SQLite no volume persistente montado em `/app/data`.
- O Excel deve ser usado como carga inicial confiável.
- Depois da carga inicial, o app sincroniza a API 222 automaticamente a cada hora.
- A sincronização incremental usa `update_time` com janela de 2 horas (`SYNC_LOOKBACK_HOURS=2`) para reduzir risco de perder atualizações.
