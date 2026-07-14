### Diapositiva 1: Título y Visión

* **V.A.C.A: Infraestructura cívica de resiliencia post-catástrofe.** \.  
* **Visión:** Un sistema comunitario de catastro distribuido que permite construir información confiable en emergencias, coordinando posteriormente la distribución trazable de ayuda humanitaria usando Stellar y USDC \.

### Diapositiva 2: El Problema (El "Día 0")

* **Colapso de infraestructura:** En las primeras horas de un desastre, la infraestructura de telecomunicaciones e institucional colapsa, creando "islas locales de información" \.  
* **El Estado llega tarde:** El levantamiento de catastros oficiales, como la Ficha Básica de Emergencia (FIBE), tarda días en ejecutarse \.  
* **La "Segunda Catástrofe":** La solidaridad se organiza informalmente provocando un desorden logístico severo \. Esto genera saturación de rutas, falta de transparencia y la llegada de bienes en mal estado (ej. pañales vencidos), lo que indignifica a los damnificados \.

### Diapositiva 3: La Solución (Community-first Disaster Intelligence)

* Vaquita es un **ecosistema de resiliencia post-catástrofe** \.  
* Transformamos a los damnificados y vecinos en **"operadores comunitarios espontáneos"** \.  
* **Arquitectura Mobile-first y Offline-first:** Ante la falta de internet, los usuarios utilizan una app con bases de datos locales (SQLite) para registrar daños y necesidades de forma aislada \.

### Diapositiva 4: ¿Cómo funciona la arquitectura de confianza?

* **Fase 1 \- Captura Local Aislada:** Dispositivos móviles capturan reportes *offline* en la zona cero \.  
* **Fase 2 \- Sincronización Eventual:** Al encontrar conectividad parcial, los paquetes de datos se sincronizan con la nube \.  
* **Fase 3 \- Confianza Progresiva:** El sistema cruza múltiples reportes y eleva el nivel de confianza de la información, generando una "verdad emergente" antes de la validación oficial \.  
* **Fase 4 \- Distribución (Aid Layer):** Con los datos validados, se activa la capa financiera para la entrega de recursos \.

### Diapositiva 5: ¿Por qué Stellar es nuestro motor?

Utilizamos la red Stellar por sus **costos de fracción de centavo y liquidaciones en segundos** \, usando sus primitivas nativas:

* **Claimable Balances:** Asignamos fondos (USDC) a los damnificados verificados, asegurando los recursos aunque las personas tarden en reclamarlos \.  
* **Cuentas Multifirma:** Cada evento de emergencia tiene su propia *wallet* que exige firmas conjuntas (ej. Plataforma, Municipalidad) para prevenir el fraude \.  
* **Tokenización de Insumos:** Las donaciones físicas se digitalizan en *assets* (ej. ITEM-AGUA), permitiendo auditar la trazabilidad exacta de su entrega \.

### Diapositiva 6: Modelo de Negocio y Escalabilidad Latam

* **Gratis para los afectados:** Los ciudadanos y voluntarios no pagan por coordinar la ayuda \.  
* **SaaS B2G / B2B Institucional:** Cobramos a gobiernos y ONGs por el acceso a *Vaquita Insights*, nuestra capa de inteligencia de datos y analítica predictiva \.  
* **Nuestra Ventaja Injusta:** Al no tener la custodia de los fondos (que fluyen por Stellar), **evitamos la fricción regulatoria bancaria transfronteriza** \. Vendemos "inteligencia y coordinación", no transacciones financieras directas \.

### Diapositiva 7: Tamaño de Mercado (TAM, SAM, SOM)

*Demostramos sostenibilidad económica a través de un modelo GovTech B2G altamente escalable:*

* **TAM (Latinoamérica):** Existen 15.747 gobiernos locales en 17 países \. Con un ticket anual de 245,6 UTM por municipio, el **TAM municipal base es de \~$310,7 millones de dólares ARR** \.  
* **SAM (Primera Ola):** Enfocados en países con alta exposición a desastres (Chile, Colombia, Perú, Ecuador y Paraguay) que agrupan a 3.709 gobiernos locales. Esto representa un **SAM municipal base de \~$73,2 millones de dólares ARR** \.  
* **SOM (Año 5):** Proyectando la adopción de aproximadamente 90 municipios de pago más licencias para ONGs, nuestro ingreso capturable alcanza los **\~$3,22 millones de dólares ARR** (aprox. 4,2% del SAM ampliado) \.

### Diapositiva 8: Nuestro Objetivo con el Instaward

1. Buscamos ejecutar experimentación rápida y avanzar en nuestro **MVP (Capa de Catastro Offline \+ Capa de Ayuda con Stellar)** \.  
2. **Entregables:**  
3. Aplicación móvil *offline-first* para catastro temprano y sincronización eventual \.  
4. Integración de la red Stellar y Soroban para el uso de *claimable balances* (con USDC) y emisión de *vouchers* básicos \.

### Diapositiva 9: El Equipo y el Futuro

* Un equipo dedicado a crear innovación cívica y Bienes Públicos.  
* **El Futuro:** Lanzaremos el **Índice Nacional de Emergencias** para auditar vulnerabilidades históricas \, e implementaremos **gobernanza comunitaria** mediante tokens para que los afectados voten sobre la priorización de recursos \.  
* **Cierre:** Con nuestro modelo GovTech SaaS logramos la sostenibilidad económica, permitiéndonos integrar Stellar como una potente capa complementaria para reconstruir la confianza social, antes de que regrese la infraestructura institucional.

