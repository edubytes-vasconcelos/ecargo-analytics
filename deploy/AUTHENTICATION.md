# Login próprio e administração de usuários

O painel usa contas locais, sem Microsoft Entra ou serviço de e-mail. A consulta do painel continua disponível sem login; alterações em projetos, mensagens, envio e download de evidências exigem uma sessão e a troca da senha inicial. As configurações do painel e a administração de usuários exigem perfil Administrador.

## Primeiro administrador

No mesmo ambiente e com o mesmo `DATA_DIR` do serviço, execute:

```powershell
python scripts/manage_users.py bootstrap
```

O comando solicita nome, e-mail e senha sem exibi-la. Só pode criar o administrador inicial quando ainda não existem contas locais. Não há senha padrão nem endpoint público para criação de administradores.

Em Kubernetes, o comando também está disponível na imagem:

```sh
kubectl -n SEU_NAMESPACE exec -it deployment/SEU_DEPLOYMENT -- python scripts/manage_users.py bootstrap
```

Entre pelo botão **Entrar**. Mesmo o administrador precisa trocar a senha inicial no primeiro acesso. Depois, use **Usuários** para cadastrar colaboradores ou outros administradores. A senha inicial gerada aparece somente na resposta da criação ou redefinição, para entrega direta à pessoa; não é enviada por e-mail e não deve ser colocada em logs.

## Perfis e recuperação

- Administrador: gerencia contas, perfis, ativação e configurações; também colabora nos cards.
- Colaborador: edita projetos e atividades, troca mensagens e envia evidências; não pode gerenciar contas ou configurações.
- A desativação, redefinição da senha ou alteração do perfil encerra as sessões da conta afetada. O último administrador ativo não pode ser desativado ou rebaixado.
- O administrador pode gerar uma nova senha inicial para outra conta. Quem perdeu a senha deve pedir a redefinição; não há recuperação automática por e-mail.
- Caso nenhum administrador consiga entrar, um operador com acesso ao ambiente pode executar `python scripts/manage_users.py reset-password`. O comando pede e-mail e nova senha inicial, invalida as sessões e exige nova troca no próximo login.

## Implantação

Senhas têm entre 12 e 256 caracteres e ficam armazenadas com scrypt, salt individual e parâmetros N=16384, r=8, p=5. Cookies são HttpOnly, SameSite=Lax e Secure por padrão. Use HTTPS no ambiente publicado. Para desenvolvimento local em HTTP, configure `AUTH_COOKIE_SECURE=0` antes de iniciar o serviço. Não use essa opção para publicação pela internet.

As sessões expiram após oito horas e as alterações exigem token CSRF. Tentativas inválidas de login são limitadas por endereço de origem e conta. A autoria vem exclusivamente da sessão do servidor; o nome enviado no corpo de uma mensagem não substitui o autor autenticado.

Contas, hashes, sessões e notificações ficam em `DATA_DIR/project_auth.sqlite`; mantenha esse volume persistente e inclua-o no backup junto de `projects.json` e das evidências. Use uma réplica do serviço, pois a escrita do arquivo de projetos JSON é protegida por processo.

A URL do sistema pode conter `BASE_PATH`: os cookies e as chamadas da interface respeitam esse caminho. A integração `MS_GRAPH_*` de leitura do SharePoint continua independente.

## Verificação

```powershell
python scripts/test_project_management.py
python scripts/smoke_project_management.py
```

Os testes criam dados e contas temporários. Não cadastram usuários reais. O teste no navegador precisa do Playwright já instalado no ambiente de desenvolvimento.

Referências: [armazenamento de senhas OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), [hashlib.scrypt](https://docs.python.org/3/library/hashlib.html).
