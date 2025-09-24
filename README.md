# 🖥️ Simulador de Planificación de Procesos

Este proyecto es un **simulador visual** de algoritmos de planificación de CPU en sistemas operativos.  
Permite crear procesos, elegir un algoritmo de planificación y observar en tiempo real cómo se ejecutan, mostrando tanto la cola de listos, el estado de la CPU, el historial de ejecución y las métricas finales de cada proceso.  



## Tecnologías utilizadas
- **Node.js** → entorno de ejecución.  
- **Express.js** → servidor web para servir la aplicación.  
- **Socket.IO** → comunicación en tiempo real entre servidor y cliente (ticks del reloj de simulación).  
- **HTML5 / CSS3** → estructura y estilos de la interfaz.  
- **JavaScript (ES Modules)** → lógica del simulador y la interfaz gráfica.  



## Algoritmos implementados
El simulador soporta tanto algoritmos **no expropiativos** como **expropiativos**:

- **FCFS (First Come, First Served)** → primer proceso en llegar es el primero en ejecutarse.  
- **SJF (Shortest Job First)** → se ejecuta primero el proceso con menor ráfaga.  
- **SRTF (Shortest Remaining Time First)** → versión expropiativa de SJF (interrumpe si llega un proceso más corto).  
- **RR (Round Robin)** → planificación por turnos con **quantum configurable**.  



## Metricas calculadas
Al finalizar cada proceso, se muestran automáticamente:  

- **Turnaround Time (TT)** = Tiempo de finalización – Tiempo de llegada  
- **Waiting Time (WT)** = TT – Burst  
- **Response Time (RT)** = Primer uso de CPU – Tiempo de llegada  
