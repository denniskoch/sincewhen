FROM php:7-apache
LABEL Author="Dennis Koch <denkoc@project413.net>"

ENV DEBIAN_FRONTEND noninteractive

ENV TZ=America/New_York

RUN apt-get update

# install required database php extensions
RUN docker-php-ext-install \
        mysqli \
        pdo \
        pdo_mysql

RUN apt-get clean

COPY html/ /var/www/html/