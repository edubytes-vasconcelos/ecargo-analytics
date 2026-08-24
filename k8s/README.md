# eCargo Analytics - Deploy GitOps

Este diretorio adapta o portal `ecargo-analytics` para o novo padrao de deploy Kubernetes/GitOps.

## Estrutura

```text
k8s/
├── ecargo-analytics/
│   └── ecargo-analytics.yaml
├── vars.hml.env
└── vars.prd.env
scripts/
└── deploy-app.sh
```

## Variaveis por ambiente

Antes de publicar, ajuste os arquivos:

- `k8s/vars.hml.env`
- `k8s/vars.prd.env`

Campos principais:

- `NAMESPACE`: namespace alvo no Rancher/Kubernetes.
- `IMAGE`: imagem imutavel publicada no registry.
- `BASE_PATH`: caminho publico da aplicacao, hoje `/ecargo-analytics`.
- `INGRESS_HOST`: DNS publico do ambiente.
- `TLS_SECRET`: secret TLS disponivel no namespace.

## Secrets

Os secrets nao ficam versionados. Crie manualmente no namespace alvo:

```bash
kubectl -n hml-signa-ecargo create secret generic ecargo-analytics-secrets \
  --from-literal=ECARGO_222_USER='<usuario>' \
  --from-literal=ECARGO_222_PASSWORD='<senha>' \
  --from-literal=MS_GRAPH_TENANT_ID='<tenant-id>' \
  --from-literal=MS_GRAPH_CLIENT_ID='<client-id>' \
  --from-literal=MS_GRAPH_CLIENT_SECRET='<client-secret>'
```

As keys `MS_GRAPH_*` sao opcionais no manifesto. Sem elas, o upload manual continua funcionando, mas a leitura automatica de arquivos do SharePoint fica indisponivel.

## Deploy manual

```bash
./scripts/deploy-app.sh hml ecargo-analytics
```

Para producao:

```bash
./scripts/deploy-app.sh prd ecargo-analytics
```

## URL

Com as variaveis atuais, a URL fica:

```text
https://${INGRESS_HOST}${BASE_PATH}
```
