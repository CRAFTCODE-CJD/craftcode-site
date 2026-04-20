---
title: Как использовать
description: Добавить MouseInterceptorComponent и подписаться на делегаты мыши в Blueprint.
sidebar:
  order: 2
---

## Шаг 1 — Добавить компонент

1. Открой актора, в котором нужен перехват.
2. В панели **Components** нажми **Add Component**.
3. Найди **MouseInterceptorComponent** и добавь его.

![MouseInterceptorComponent в панели Components](https://raw.githubusercontent.com/CRAFTCODE-CJD/MouseInterceptor/main/Images/Image_01.png)

---

## Шаг 2 — Подписаться на делегаты в Blueprint

1. Выбери актора с `MouseInterceptorComponent`.
2. В **Blueprint Event Graph** добавь узлы событий `OnMousePressed` или `OnMouseReleased`.

![Blueprint: привязка делегата OnMousePressed](https://raw.githubusercontent.com/CRAFTCODE-CJD/MouseInterceptor/main/Images/Image_02.png)

3. Реализуй логику:
   - Параметр `Button` — какая кнопка нажата
   - Параметр `bIsDoubleClick` — это двойной клик?

![Blueprint: использование параметров Button и bIsDoubleClick](https://raw.githubusercontent.com/CRAFTCODE-CJD/MouseInterceptor/main/Images/Image_03.png)

---

## Пример логики Blueprint

```
Event OnMousePressed
    → Branch: Is Double Click?
        True:  Print "Двойной клик!"
        False: Print "Одиночный клик!"
```

![Blueprint логика](https://raw.githubusercontent.com/CRAFTCODE-CJD/MouseInterceptor/main/Images/Image_04.png)

---

## Настройка порога двойного клика

Используй функцию `SetDoubleClickThreshold` чтобы задать интервал определения двойного клика (в секундах):

```cpp
MouseInterceptorComponent->SetDoubleClickThreshold(0.5f);
```

Или через Blueprint:

![SetDoubleClickThreshold в Blueprint](https://raw.githubusercontent.com/CRAFTCODE-CJD/MouseInterceptor/main/Images/Image_05.png)

> Чтобы **отключить** двойной клик — установи очень большое значение (например `10.0f`).

---

## Заметки

- Плагин обрабатывает ввод **только на клиентской стороне**. Сетевая репликация не поддерживается.
- Компонент не требует тиков — производительность не страдает при добавлении в любое количество акторов.
