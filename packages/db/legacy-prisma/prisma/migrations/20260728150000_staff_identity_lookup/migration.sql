-- Uma identidade do Auth pertence a uma única Loja no MVP. O índice também
-- sustenta a resolução de membership em tempo constante antes de haver contexto.
CREATE UNIQUE INDEX "store_members_user_id_key" ON "store_members"("user_id");

-- A senha exclusiva é provisionada fora da migration e do repositório. Sem
-- senha configurada manualmente, LOGIN não cria uma credencial utilizável.
ALTER ROLE foode_business LOGIN;

-- O JWT verificado fornece somente user_id. Esta policy permite que a role de
-- negócio leia a própria membership; as demais policies continuam isolando a
-- Loja derivada em todas as operações posteriores.
CREATE POLICY "store_members_identity_lookup" ON "store_members"
    FOR SELECT TO foode_business
    USING (
        "user_id" = (
            SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid
        )
    );
